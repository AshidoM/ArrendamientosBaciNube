// src/components/CreditosTable.tsx
import { useEffect, useMemo, useState } from "react";
import { Eye, Edit3, MoreVertical, Trash2, RefreshCcw, ChevronLeft, ChevronRight } from "lucide-react";

export type CreditoRow = {
  id: number;
  folio: string | number;
  titular?: string | null;           // nombre del cliente/coordinadora
  sujeto: "CLIENTE" | "COORDINADORA";
  semanas_plan: number;
  semanas_pagadas?: number | null;   // si no existe en BD, el servicio la puede mandar en 0
  cuota?: number | null;             // puede venir calculada o persistida
  monto_total: number;
  estado: "ACTIVO" | "INACTIVO" | "FINALIZADO";
};

type Props = {
  rows: CreditoRow[];
  total: number;
  page: number;
  pageSize: number;             // fijado en 5 desde la página
  onPageChange: (n: number) => void;
  search: string;
  onSearch: (q: string) => void;

  onView: (r: CreditoRow) => void;
  onEdit: (r: CreditoRow) => void;
  onDelete: (r: CreditoRow) => void;
  onRenew: (r: CreditoRow) => void;
};

export default function CreditosTable({
  rows, total, page, pageSize, onPageChange,
  search, onSearch, onView, onEdit, onDelete, onRenew
}: Props) {

  const [menuFor, setMenuFor] = useState<number | null>(null);

  const from = useMemo(() => (total === 0 ? 0 : (page - 1) * pageSize + 1), [page, pageSize, total]);
  const to   = useMemo(() => Math.min(page * pageSize, total), [page, pageSize, total]);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function isRenovable(r: CreditoRow) {
    const pagadas = Number(r.semanas_pagadas ?? 0);
    return pagadas >= 10 && r.estado === "ACTIVO";
  }

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="dt__search--sm">
            <input
              className="input"
              placeholder="Buscar por folio o titular…"
              value={search}
              onChange={(e)=>onSearch(e.target.value)}
            />
          </div>
          <div className="text-[12.5px] text-muted self-end">Mostrando 5 por página</div>
          <div />
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-center">Folio</th>
              <th className="text-center">Titular</th>
              <th className="text-center">Sujeto</th>
              <th className="text-center">Semanas</th>
              <th className="text-center">Cuota</th>
              <th className="text-center">Monto</th>
              <th className="text-center">Estado</th>
              <th className="th--actions-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[13px] text-muted">
                  Sin resultados.
                </td>
              </tr>
            ) : rows.map(r => {
              const avance = `${Number(r.semanas_pagadas ?? 0)} de ${r.semanas_plan}`;
              const renovable = isRenovable(r);
              return (
                <tr key={r.id}>
                  <td className="text-center text-[13px]">{r.folio}</td>
                  <td className="text-center text-[13px]">{r.titular ?? "—"}</td>
                  <td className="text-center text-[13px]">{r.sujeto}</td>
                  <td className="text-center text-[13px]">
                    <span className="badge">{avance}</span>
                    {renovable && <span className="badge-renovable ml-2" title="Ya puedes renovar">RENOVABLE</span>}
                  </td>
                  <td className="text-center text-[13px]">{r.cuota != null ? r.cuota.toFixed(2) : "—"}</td>
                  <td className="text-center text-[13px]">{r.monto_total.toFixed(2)}</td>
                  <td className="text-center text-[13px]">
                    {r.estado === "ACTIVO"
                      ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span>
                      : r.estado === "FINALIZADO"
                      ? <span className="text-green-700 font-medium">FINALIZADO</span>
                      : <span className="text-gray-500">INACTIVO</span>}
                  </td>
                  <td className="td--actions-center">
                    <div className="inline-flex gap-2 nowrap">
                      <button className="btn-outline btn--sm" onClick={()=>onView(r)}>
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </button>
                      <button className="btn-primary btn--sm" onClick={()=>onEdit(r)}>
                        <Edit3 className="w-3.5 h-3.5" /> Editar
                      </button>
                      <div className="relative">
                        <button className="btn-outline btn--sm" onClick={()=>setMenuFor(menuFor===r.id?null:r.id)}>
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {menuFor === r.id && (
                          <div className="absolute right-0 mt-1 w-52 border bg-white rounded-2 shadow-xl z-[1000]" onMouseLeave={()=>setMenuFor(null)}>
                            <button
                              className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 flex items-center gap-2"
                              onClick={()=>{ if (renovable) onRenew(r); }}
                              disabled={!renovable}
                              title={renovable ? "Renovar crédito" : "Aún no cumple criterio (>=10 semanas)"}
                            >
                              <RefreshCcw className="w-4 h-4" /> Renovar
                            </button>
                            <button
                              className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 flex items-center gap-2 text-red-700"
                              onClick={()=>onDelete(r)}
                            >
                              <Trash2 className="w-4 h-4" /> Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Paginación */}
        <div className="px-3 py-2 border-top flex items-center justify-between">
          <div className="text-[12.5px] text-muted">
            {total === 0 ? "0" : `${from}–${to}`} de {total}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline btn--sm" onClick={()=>onPageChange(Math.max(1, page-1))} disabled={page<=1}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="text-[12.5px]">Página</div>
            <input
              className="input input--sm !w-16 text-center"
              value={page}
              onChange={(e)=> {
                const v = parseInt(e.target.value || "1", 10);
                if (!Number.isNaN(v)) onPageChange(v);
              }}
            />
            <div className="text-[12.5px]">de {pages}</div>
            <button className="btn-outline btn--sm" onClick={()=>onPageChange(Math.min(pages, page+1))} disabled={page>=pages}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
