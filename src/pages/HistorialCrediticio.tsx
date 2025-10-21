// src/pages/HistorialCrediticio.tsx
import { useEffect, useMemo, useState } from "react";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";

type Row = {
  id: number;
  folio: number | string;
  sujeto: "CLIENTE" | "COORDINADORA";
  semanas_plan: number;
  monto: number;
  cuota: number;
  estado: string;
  primer_pago: string; // ISO
  fecha_alta: string;  // ISO
  cliente: { nombre: string } | null;
  coordinadora: { nombre: string } | null;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export default function HistorialCrediticio() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 5; // fijo a 5 por página
  const [search, setSearch] = useState("");

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  async function load() {
    let q = supabase
      .from("creditos")
      .select(`
        id, folio, sujeto, semanas_plan, monto, cuota, estado, primer_pago, fecha_alta,
        cliente:clientes ( nombre ),
        coordinadora:coordinadoras ( nombre )
      `, { count: "exact" })
      .eq("estado", "FINALIZADO")
      .order("fecha_alta", { ascending: false })
      .order("id", { ascending: false });

    const s = search.trim();

    if (s) {
      const n = Number(s);
      if (!Number.isNaN(n)) {
        q = q.eq("folio", n);
      }
    }

    const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) { console.error(error); return; }

    let result = (data || []) as any as Row[];
    if (s && Number.isNaN(Number(s))) {
      const sL = s.toLowerCase();
      result = result.filter(r => {
        const name = (r.sujeto === "CLIENTE" ? r.cliente?.nombre : r.coordinadora?.nombre) ?? "";
        return name.toLowerCase().includes(sL);
      });
    }

    setRows(result);
    setTotal(count || result.length);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, search]);

  function titularDe(r: Row) {
    return r.sujeto === "CLIENTE" ? (r.cliente?.nombre ?? "—") : (r.coordinadora?.nombre ?? "—");
  }

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="relative">
            <input
              className="input dt__search--sm"
              placeholder="Buscar por folio o titular…"
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            />
          </div>
          {/* Columna de espacio para alinear con el layout (Mostrar / botón) */}
          <div />
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
              <th className="text-center">Fecha alta</th>
              <th className="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[13px] text-muted">Sin resultados.</td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px] text-center">{r.folio}</td>
                <td className="text-[13px] text-center">{titularDe(r)}</td>
                <td className="text-[13px] text-center">{r.sujeto}</td>
                <td className="text-[13px] text-center">{r.semanas_plan}</td>
                <td className="text-[13px] text-center">{money(r.cuota)}</td>
                <td className="text-[13px] text-center">{money(r.monto)}</td>
                <td className="text-[13px] text-center">{r.fecha_alta}</td>
                <td>
                  <div className="flex items-center justify-center gap-2">
                    <button className="btn-outline btn--sm" title="Ver">
                      <Eye className="w-4 h-4" /> Ver
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div className="px-3 py-2 border-t flex items-center justify-between">
          <div className="text-[12.5px] text-muted">{total === 0 ? "0" : `${from}–${to}`} de {total}</div>
          <div className="flex items-center gap-2">
            <button className="btn-outline btn--sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="text-[12.5px]">Página</div>
            <input
              className="input input--sm !w-16 text-center"
              value={page}
              onChange={(e) => {
                const v = parseInt(e.target.value || "1", 10);
                if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), pages));
              }}
            />
            <div className="text-[12.5px]">de {pages}</div>
            <button className="btn-outline btn--sm" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
