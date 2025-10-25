// src/pages/Multas.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ShieldAlert, X } from "lucide-react";

type Row = {
  multa_id: number;
  credito_id: number;
  folio: string | null;
  titular: string;
  monto: number;
  monto_pagado: number;
  fecha_creacion: string;
};

export default function Multas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [q, setQ] = useState("");

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: m } = await supabase
      .from("multas")
      .select("id, credito_id, monto, monto_pagado, fecha_creacion")
      .eq("estado", "ACTIVO");

    let out: Row[] = [];
    if (m && m.length > 0) {
      const credIds = Array.from(new Set(m.map(x => x.credito_id)));
      const { data: v } = await supabase
        .from("vw_credito_resumen")
        .select("credito_id, folio, titular")
        .in("credito_id", credIds);

      const vMap = new Map<number, any>((v || []).map(r => [r.credito_id, r]));
      out = m.map(mm => ({
        multa_id: mm.id,
        credito_id: mm.credito_id,
        folio: vMap.get(mm.credito_id)?.folio ?? null,
        titular: vMap.get(mm.credito_id)?.titular ?? "—",
        monto: Number(mm.monto),
        monto_pagado: Number(mm.monto_pagado),
        fecha_creacion: mm.fecha_creacion,
      }));
    }

    const qq = q.trim().toLowerCase();
    if (qq) {
      out = out.filter(r =>
        (r.folio ?? "").toLowerCase().includes(qq) ||
        (r.titular ?? "").toLowerCase().includes(qq)
      );
    }

    setTotal(out.length);
    setRows(out.slice(from, to + 1));
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, q]);

  async function quitar(multaId: number) {
    if (!confirm("¿Quitar M15 activa?")) return;
    const { error } = await supabase.from("multas").update({
      estado: "INACTIVO",
      fecha_pago: new Date().toISOString(),
    }).eq("id", multaId);
    if (!error) load();
  }

  return (
    <div className="max-w-[1100px]">
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input className="input" placeholder="Buscar por folio o titular…" value={q} onChange={(e)=>{ setPage(1); setQ(e.target.value); }} />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select className="input input--sm" value={pageSize} onChange={(e)=>{ setPage(1); setPageSize(parseInt(e.target.value)); }}>
              {[10,15,20].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="table-frame">
        <table className="min-w-full">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Titular</th>
              <th>Monto</th>
              <th>Pagado</th>
              <th>Pendiente</th>
              <th>Creación</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[13px] text-gray-500">No hay M15 activas.</td></tr>
            ) : rows.map(r => (
              <tr key={r.multa_id}>
                <td className="text-[13px]">{r.folio ?? "—"}</td>
                <td className="text-[13px]">{r.titular}</td>
                <td className="text-[13px]">${r.monto.toFixed(2)}</td>
                <td className="text-[13px]">${r.monto_pagado.toFixed(2)}</td>
                <td className="text-[13px]">${(r.monto - r.monto_pagado).toFixed(2)}</td>
                <td className="text-[13px]">{new Date(r.fecha_creacion).toLocaleString()}</td>
                <td>
                  <div className="flex justify-end">
                    <button className="btn-ghost btn--sm text-amber-700" onClick={()=>quitar(r.multa_id)}>
                      <ShieldAlert className="w-4 h-4" /> Quitar M15
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${(page-1)*pageSize + 1}–${Math.min(page*pageSize, total)}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</button>
          <span className="text-[12.5px]">Página</span>
          <input className="input input--sm input--pager" value={page} onChange={(e)=>setPage(Math.max(1, parseInt(e.target.value||"1")))} />
          <span className="text-[12.5px]">de {pages}</span>
          <button className="btn-outline btn--sm" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}
