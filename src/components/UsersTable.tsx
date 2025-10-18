// src/components/UsersTable.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Eye, Edit3, MoreVertical, KeyRound, MapPin, Trash2, Power, FileStack, Route as RouteIcon,
  ChevronLeft, ChevronRight
} from "lucide-react";
import type { AppUser } from "../auth";

/* ====== Tipos ====== */
export type UserRow = AppUser & {
  correo: string | null;
  telefono: string | null;
  ine: string | null;
  created_at?: string;
  updated_at?: string;
};

type ActionHandlers = {
  onView: (u: UserRow) => void;
  onEdit: (u: UserRow) => void;
  onPassword: (u: UserRow) => void;
  onAssignPobs: (u: UserRow) => void;
  onAssignRoutes: (u: UserRow) => void;      // NUEVO
  onToggleActive: (u: UserRow) => void;
  onDelete: (u: UserRow) => void;
  onDocs: (u: UserRow) => void;
  onCreate: () => void;
};

type Props = ActionHandlers & {
  rows: UserRow[];
  total: number;
  page: number;        // 1-based
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  search: string;
  onSearch: (q: string) => void;
};

/* ====== Menú en portal ====== */
type PortalMenuState = {
  open: boolean;
  x: number;
  y: number;
  row?: UserRow;
};

function PortalMenu({
  state,
  onClose,
  onPassword, onAssignPobs, onAssignRoutes, onToggle, onDocs, onDelete,
}: {
  state: PortalMenuState;
  onClose: () => void;
  onPassword: (u: UserRow) => void;
  onAssignPobs: (u: UserRow) => void;
  onAssignRoutes: (u: UserRow) => void;
  onToggle: (u: UserRow) => void;
  onDocs: (u: UserRow) => void;
  onDelete: (u: UserRow) => void;
}) {
  if (!state.open || !state.row) return null;
  const u = state.row;

  const body = (
    <div
      className="portal-menu"
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="portal-menu__item" onClick={() => { onPassword(u); onClose(); }}>
        <KeyRound className="w-4 h-4" /> Actualizar contraseña
      </button>

      {/* NUEVO: Asignar Rutas (para cualquier rol, pero normalmente útil en CAPTURISTA) */}
      <button className="portal-menu__item" onClick={() => { onAssignRoutes(u); onClose(); }}>
        <RouteIcon className="w-4 h-4" /> Asignar rutas
      </button>

      {/* Asignar Poblaciones sólo si es capturista */}
      {u.rol?.toUpperCase() === "CAPTURISTA" && (
        <button className="portal-menu__item" onClick={() => { onAssignPobs(u); onClose(); }}>
          <MapPin className="w-4 h-4" /> Asignar poblaciones
        </button>
      )}

      <button className="portal-menu__item" onClick={() => { onDocs(u); onClose(); }}>
        <FileStack className="w-4 h-4" /> Docs
      </button>

      <button className="portal-menu__item" onClick={() => { onToggle(u); onClose(); }}>
        <Power className="w-4 h-4" /> {u.estado === "ACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO"}
      </button>

      <button className="portal-menu__item portal-menu__item--danger" onClick={() => { onDelete(u); onClose(); }}>
        <Trash2 className="w-4 h-4" /> Eliminar
      </button>
    </div>
  );
  return createPortal(body, document.body);
}

/* ====== Tabla ====== */
export default function UsersTable({
  rows, total, page, pageSize, onPageChange, onPageSizeChange,
  search, onSearch,
  onView, onEdit, onPassword, onAssignPobs, onAssignRoutes, onToggleActive, onDelete, onDocs,
  onCreate,
}: Props) {
  const [menu, setMenu] = useState<PortalMenuState>({ open: false, x: 0, y: 0 });

  // cerrar menú en scroll/resize/click global
  useEffect(() => {
    const close = () => setMenu(s => ({ ...s, open: false }));
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("click", close);
    };
  }, []);

  const from  = useMemo(() => (total === 0 ? 0 : (page - 1) * pageSize + 1), [page, pageSize, total]);
  const to    = useMemo(() => Math.min(page * pageSize, total), [page, pageSize, total]);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function openMenuFor(btn: HTMLButtonElement, row: UserRow) {
    const r = btn.getBoundingClientRect();
    setMenu({
      open: true,
      x: Math.min(window.innerWidth - 240, r.right - 220),
      y: r.bottom + 6,
      row,
    });
  }

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar usuario…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select
              className="input input--sm"
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
            >
              {[5, 8, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex justify-end">
            <button
              className="btn-primary btn--sm"
              onClick={(e) => { e.stopPropagation(); onCreate(); }}
            >
              + Crear nuevo
            </button>
          </div>
        </div>
      </div>

      {/* Tabla (marco cerrado) */}
      <div className="table-frame">
        <table className="min-w-full">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>INE</th>
              <th>Teléfono</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[13px] text-gray-500">
                  Sin resultados.
                </td>
              </tr>
            ) : rows.map(u => (
              <tr key={u.id}>
                <td className="text-[13px]">
                  <div className="font-medium">{u.nombre_completo || "—"}</div>
                  <div className="text-[12px] text-gray-600">@{u.username}</div>
                </td>

                <td><span className="badge">{u.rol?.toUpperCase()}</span></td>

                <td className="text-[13px]">
                  {u.estado === "ACTIVO"
                    ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span>
                    : <span className="text-gray-500">INACTIVO</span>}
                </td>

                <td className="text-[13px]">{u.ine || "—"}</td>
                <td className="text-[13px]">{u.telefono || "—"}</td>

                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-outline btn--sm" onClick={(e)=>{e.stopPropagation(); onView(u);}}>
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" onClick={(e)=>{e.stopPropagation(); onEdit(u);}}>
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-outline btn--sm"
                      onClick={(e) => { e.stopPropagation(); openMenuFor(e.currentTarget, u); }}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${from}–${to}`} de {total}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn-outline btn--sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[12.5px]">Página</span>
            <input
              className="input input--sm input--pager"
              value={page}
              onChange={(e) => {
                const v = parseInt(e.target.value || "1");
                if (!Number.isNaN(v)) {
                  const toPage = Math.min(Math.max(1, v), pages);
                  onPageChange(toPage);
                }
              }}
            />
            <span className="text-[12.5px]">de {pages}</span>
          </div>

          <button
            className="btn-outline btn--sm"
            disabled={page >= pages}
            onClick={() => onPageChange(Math.min(pages, page + 1))}
          >
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Portal del menú */}
      <PortalMenu
        state={menu}
        onClose={() => setMenu(s => ({ ...s, open: false }))}
        onPassword={onPassword}
        onAssignPobs={onAssignPobs}
        onAssignRoutes={onAssignRoutes}
        onToggle={onToggleActive}
        onDocs={onDocs}
        onDelete={onDelete}
      />
    </div>
  );
}
