import { useEffect, useMemo, useState } from "react";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Row = {
  id: number;
  folio_publico: string;
  sujeto: "CLIENTE" | "COORDINADORA";
  semanas: number;
  monto_principal: number;
  cuota_semanal: number;
  estado: string;
  primer_pago: string | null; // ISO
  created_at: string; // alta
  updated_at: string; // finalización (cuando pasó a FINALIZADO)
  cliente?: { nombre: string } | null;
  coordinadora?: { nombre: string } | null;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return d.slice(0, 10);
}

export default function HistorialCrediticio() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 5; // fijo
  const [search, setSearch] = useState("");

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  async function load() {
    // Traemos FINALIZADOS con alias para columnas reales de la tabla
    let q = supabase
      .from("creditos")
      .select(
        `
        id,
        folio_publico,
        sujeto,
        semanas,
        monto_principal,
        cuota_semanal,
        estado,
        primer_pago,
        created_at,
        updated_at,
        cliente:clientes ( nombre ),
        coordinadora:coordinadoras ( nombre )
      `,
        { count: "exact" }
      )
      .eq("estado", "FINALIZADO")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });

    const s = search.trim();
    if (s) {
      const n = Number(s);
      if (!Number.isNaN(n)) {
        // si escribe un número, buscamos por folio_externo a través de folio_publico (si tu folio_publico es CR-*)
        q = q.or(`folio_publico.eq.CR-${n},folio_externo.eq.${n}`);
      } else {
        // no podemos filtrar por nombre en la consulta si no tienes RLS para joins, así que filtramos después
      }
    }

    const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) {
      console.error(error);
      return;
    }

    let result = (data || []) as any as Row[];

    // Filtro por nombre (cliente/coordinadora) en memoria si el término no es numérico
    if (s && Number.isNaN(Number(s))) {
      const sL = s.toLowerCase();
      result = result.filter((r) => {
        const name =
          (r.sujeto === "CLIENTE" ? r.cliente?.nombre : r.coordinadora?.nombre) ?? "";
        return name.toLowerCase().includes(sL);
      });
    }

    setRows(result);
    setTotal(count || result.length);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  function titularDe(r: Row) {
    return r.sujeto === "CLIENTE"
      ? r.cliente?.nombre ?? "—"
      : r.coordinadora?.nombre ?? "—";
  }

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="relative">
            <input
              className="input dt__search--sm"
              placeholder="Buscar por folio (CR-# / externo) o titular…"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
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
              <th className="text-center">Finalizado</th>
              <th className="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[13px] text-muted">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-[13px] text-center">{r.folio_publico}</td>
                  <td className="text-[13px] text-center">{titularDe(r)}</td>
                  <td className="text-[13px] text-center">{r.sujeto}</td>
                  <td className="text-[13px] text-center">{r.semanas}</td>
                  <td className="text-[13px] text-center">{money(r.cuota_semanal)}</td>
                  <td className="text-[13px] text-center">{money(r.monto_principal)}</td>
                  <td className="text-[13px] text-center">{fmtDate(r.created_at)}</td>
                  <td className="text-[13px] text-center">{fmtDate(r.updated_at)}</td>
                  <td>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className="btn-outline btn--sm"
                        title="Ver"
                        onClick={() => navigate(`/pagos?creditoId=${r.id}`)}
                      >
                        <Eye className="w-4 h-4" /> Ver
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer */}
        <div className="px-3 py-2 border-t flex items-center justify-between">
          <div className="text-[12.5px] text-muted">
            {total === 0 ? "0" : `${from}–${to}`} de {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-outline btn--sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
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
            <button
              className="btn-outline btn--sm"
              onClick={() => setPage(Math.min(pages, page + 1))}
              disabled={page >= pages}
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
