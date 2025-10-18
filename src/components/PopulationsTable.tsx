// components/PopulationsTable.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Edit3, MoreVertical, Trash2, Power, ChevronLeft, ChevronRight, Users as UsersIcon } from "lucide-react";

export type PoblacionRow = {
  id: number;
  folio: string | null;
  nombre: string;
  municipio: string;
  estado_mx: string;
  ruta_id: number;
  estado: "ACTIVO" | "INACTIVO";
};

type ActionHandlers = {
  onView: (p: PoblacionRow) => void;
  onEdit: (p: PoblacionRow) => void;
  onAssignClients: (p: PoblacionRow) => void;
  onToggleActive: (p: PoblacionRow) => void;
  onDelete: (p: PoblacionRow) => void;
  onCreate: () => void;
};

type Props = ActionHandlers & {
  rows: PoblacionRow[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  search: string;
  onSearch: (q: string) => void;
};

/* Portal menu */
function PortalMenu({
  row, rect, onClose, onAssignClients, onToggleActive, onDelete
}: {
  row: PoblacionRow | null;
  rect: DOMRect | null;
  onClose: () => void;
  onAssignClients: (p: PoblacionRow) => void;
  onToggleActive: (p: PoblacionRow) => void;
  onDelete: (p: PoblacionRow) => void;
}) {
  const [pos, setPos] = useState<{x:number;y:number}|null>(null);

  useEffect(() => {
    if (!rect) return;
    const x = Math.min(window.innerWidth - 240, rect.right - 220);
    const y = rect.bottom + 6;
    setPos({x,y});
  }, [rect]);

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

  if (!row || !pos) return null;

  return createPortal(
    <div className="portal-menu" style={{ left: pos.x, top: pos.y }} onClick={(e)=>e.stopPropagation()}>
      <button className="portal-menu__item" onClick={() => { onAssignClients(row); onClose(); }}>
        <UsersIcon className="w-4 h-4" /> Asignar clientes
      </button>
      <button className="portal-menu__item" onClick={() => { onToggleActive(row); onClose(); }}>
        <Power className="w-4 h-4" /> {row.estado === "ACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO"}
      </button>
      <button className="portal-menu__item portal-menu__item--danger" onClick={() => { onDelete(row); onClose(); }}>
        <Trash2 className="w-4 h-4" /> Eliminar
      </button>
    </div>,
    document.body
  );
}

export default function PopulationsTable(props: Props) {
  const {
    rows, total, page, pageSize, onPageChange, onPageSizeChange,
    search, onSearch, onView, onEdit, onAssignClients, onToggleActive, onDelete, onCreate,
  } = props;

  const [menuRow, setMenuRow] = useState<PoblacionRow | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);

  const from = useMemo(() => (total === 0 ? 0 : (page - 1) * pageSize + 1), [page, pageSize, total]);
  const to   = useMemo(() => Math.min(page * pageSize, total), [page, pageSize, total]);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return (
    <div className="dt__card">
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar población…"
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
              + Crear población
            </button>
          </div>
        </div>
      </div>

      <div className="table-frame">
        <table className="min-w-full">
          <thead>
            <tr>
              <th>Población</th>
              <th>Municipio</th>
              <th>Estado MX</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin resultados.</td></tr>
            ) : rows.map(p => (
              <tr key={p.id}>
                <td className="text-[13px]">
                  <div className="font-medium">{p.nombre}</div>
                  <div className="text-[12px] text-gray-600">{p.folio ?? ""}</div>
                </td>
                <td className="text-[13px]">{p.municipio}</td>
                <td className="text-[13px]">{p.estado_mx}</td>
                <td className="text-[13px]">
                  {p.estado === "ACTIVO"
                    ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span>
                    : <span className="text-gray-500">INACTIVO</span>}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-outline btn--sm" onClick={(e)=>{e.stopPropagation(); onView(p);}}>
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" onClick={(e)=>{e.stopPropagation(); onEdit(p);}}>
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-outline btn--sm"
                      onClick={(e)=>{ e.stopPropagation(); setMenuRow(p); setMenuRect(e.currentTarget.getBoundingClientRect()); }}
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

      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">{total === 0 ? "0" : `${from}–${to}`} de {total}</div>
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
        rect={menuRect}
        onClose={() => { setMenuRow(null); setMenuRect(null); }}
        onAssignClients={onAssignClients}
        onToggleActive={onToggleActive}
        onDelete={onDelete}
      />
    </div>
  );
}
