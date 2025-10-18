// components/RoutesTable.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Edit3, MoreVertical, Trash2, Power, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { supabase } from "../lib/supabase";

export type RutaRow = {
  id: number;
  folio: string | null;
  nombre: string;
  descripcion: string | null;
  estado: "ACTIVO" | "INACTIVO";
  created_at?: string;
  updated_at?: string;
};

type ActionHandlers = {
  onView: (r: RutaRow) => void;
  onEdit: (r: RutaRow) => void;
  onAssignPobs: (r: RutaRow) => void;
  onToggleActive: (r: RutaRow) => void;
  onDelete: (r: RutaRow) => void;
  onCreate: () => void;
};

type Props = ActionHandlers & {
  rows: RutaRow[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  search: string;
  onSearch: (q: string) => void;
};

/* ---------- Portal menu (overflow-proof) ---------- */
function PortalMenu({
  row,
  anchorRect,
  onClose,
  onAssignPobs,
  onToggleActive,
  onDelete,
}: {
  row: RutaRow | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onAssignPobs: (r: RutaRow) => void;
  onToggleActive: (r: RutaRow) => void;
  onDelete: (r: RutaRow) => void;
}) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!anchorRect) return;
    const x = Math.min(window.innerWidth - 240, anchorRect.right - 220);
    const y = anchorRect.bottom + 6;
    setCoords({ x, y });
  }, [anchorRect]);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("click", close);
    };
  }, [onClose]);

  if (!row || !coords) return null;

  const body = (
    <div
      className="portal-menu"
      style={{ left: coords.x, top: coords.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="portal-menu__item" onClick={() => { onAssignPobs(row); onClose(); }}>
        <MapPin className="w-4 h-4" /> Asignar poblaciones
      </button>
      <button className="portal-menu__item" onClick={() => { onToggleActive(row); onClose(); }}>
        <Power className="w-4 h-4" /> {row.estado === "ACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO"}
      </button>
      <button className="portal-menu__item portal-menu__item--danger" onClick={() => { onDelete(row); onClose(); }}>
        <Trash2 className="w-4 h-4" /> Eliminar
      </button>
    </div>
  );

  return createPortal(body, document.body);
}

export default function RoutesTable(props: Props) {
  const {
    rows, total, page, pageSize, onPageChange, onPageSizeChange,
    search, onSearch, onView, onEdit, onAssignPobs, onToggleActive, onDelete, onCreate,
  } = props;

  const [menuRow, setMenuRow] = useState<RutaRow | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);

  const from = useMemo(() => (total === 0 ? 0 : (page - 1) * pageSize + 1), [page, pageSize, total]);
  const to   = useMemo(() => Math.min(page * pageSize, total), [page, pageSize, total]);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar ruta…"
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
            <button className="btn-primary btn--sm" onClick={(e) => { e.stopPropagation(); onCreate(); }}>
              + Crear ruta
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame">
        <table className="min-w-full">
          <thead>
            <tr>
              <th>Ruta</th>
              <th>Descripción</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin resultados.</td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px]">
                  <div className="font-medium">{r.nombre}</div>
                  <div className="text-[12px] text-gray-600">{r.folio ?? ""}</div>
                </td>
                <td className="text-[13px]">{r.descripcion ?? "—"}</td>
                <td className="text-[13px]">
                  {r.estado === "ACTIVO"
                    ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span>
                    : <span className="text-gray-500">INACTIVO</span>}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-outline btn--sm" onClick={(e) => { e.stopPropagation(); onView(r); }}>
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" onClick={(e) => { e.stopPropagation(); onEdit(r); }}>
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-outline btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuRow(r);
                        setMenuRect(e.currentTarget.getBoundingClientRect());
                      }}
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

      {/* Footer */}
      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${from}–${to}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px]">Página</span>
            <input
              className="input input--sm input--pager"
              value={page}
              onChange={(e) => {
                const v = parseInt(e.target.value || "1");
                if (!Number.isNaN(v)) onPageChange(Math.min(Math.max(1, v), pages));
              }}
            />
            <span className="text-[12.5px]">de {pages}</span>
          </div>
          <button className="btn-outline btn--sm" disabled={page >= pages} onClick={() => onPageChange(Math.min(pages, page + 1))}>
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <PortalMenu
        row={menuRow}
        anchorRect={menuRect}
        onClose={() => { setMenuRow(null); setMenuRect(null); }}
        onAssignPobs={onAssignPobs}
        onToggleActive={onToggleActive}
        onDelete={onDelete}
      />
    </div>
  );
}
