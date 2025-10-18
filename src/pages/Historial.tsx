// src/pages/Historial.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { CalendarDays, Search } from "lucide-react";

type CreditoLite = {
  id: number;
  folio: string | null;
  sujeto: "CLIENTE" | "COORDINADORA";
  titular: string;
};

type EventoRow = {
  id: number;
  credito_id: number;
  evento: string; // CREACION, PAGO, MULTA_APLICADA, MULTA_QUITADA, RENOVACION, etc
  meta: any;
  created_at: string;
};

const EVENTOS = ["", "CREACION", "PAGO", "MULTA_APLICADA", "MULTA_QUITADA", "RENOVACION"];

export default function Historial() {
  const [q, setQ] = useState("");
  const [resultCreditos, setResultCreditos] = useState<CreditoLite[]>([]);
  const [sel, setSel] = useState<CreditoLite | null>(null);

  const [evFilter, setEvFilter] = useState<string>("");
  const [d1, setD1] = useState<string>("");
  const [d2, setD2] = useState<string>("");

  const [rows, setRows] = useState<EventoRow[]>([]);

  // buscar créditos
  useEffect(() => {
    const run = async () => {
      const term = q.trim();
      if (!term) { setResultCreditos([]); return; }
      const { data, error } = await supabase
        .from("vw_credito_resumen")
        .select("credito_id, folio, sujeto, titular")
        .or(`folio.ilike.%${term}%,titular.ilike.%${term}%`)
        .limit(10);
      if (!error) {
        setResultCreditos((data || []).map((r:any)=>({
          id: r.credito_id, folio: r.folio, sujeto: r.sujeto, titular: r.titular
        })));
      }
    };
    run();
  }, [q]);

  // cargar historial
  useEffect(() => {
    const run = async () => {
      if (!sel) { setRows([]); return; }
      let query = supabase
        .from("creditos_hist")
        .select("*")
        .eq("credito_id", sel.id)
        .order("created_at", { ascending: false });

      if (evFilter) query = query.eq("evento", evFilter);
      if (d1) query = query.gte("created_at", d1 + "T00:00:00");
      if (d2) query = query.lte("created_at", d2 + "T23:59:59");

      const { data, error } = await query;
      if (!error) setRows((data || []) as any);
    };
    run();
  }, [sel, evFilter, d1, d2]);

  return (
    <div className="max-w-[1100px]">
      {/* Búsqueda y filtros */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="relative w-full sm:max-w-md">
            <input className="input" placeholder="Buscar crédito por folio o titular…" value={q} onChange={(e)=>setQ(e.target.value)} />
            {q && resultCreditos.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 border rounded-2 bg-white max-h-72 overflow-auto z-20">
                {resultCreditos.map(c => (
                  <button key={c.id}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50"
                    onClick={()=>{ setSel(c); setResultCreditos([]); setQ(`${c.folio ?? `#${c.id}`} - ${c.titular}`); }}
                  >
                    {c.folio ?? `#${c.id}`} — {c.titular} <span className="text-muted">({c.sujeto})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select className="input input--sm" value={evFilter} onChange={(e)=>setEvFilter(e.target.value)} title="Evento">
            {EVENTOS.map(e => <option key={e} value={e}>{e ? e : "Todos"}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <div className="relative">
              <CalendarDays className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input className="input input--sm pl-8" type="date" value={d1} onChange={(e)=>setD1(e.target.value)} />
            </div>
            <span className="text-[12.5px] text-muted">—</span>
            <div className="relative">
              <CalendarDays className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input className="input input--sm pl-8" type="date" value={d2} onChange={(e)=>setD2(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {!sel ? (
        <div className="p-6 text-[13px] text-muted">
          Busca y selecciona un crédito para ver su historial.
        </div>
      ) : (
        <>
          {/* Cabecera */}
          <div className="p-3 border rounded-2 mb-3 grid sm:grid-cols-2 gap-2">
            <div className="text-[13px]">
              <div className="text-muted text-[12px]">Crédito</div>
              <div className="font-medium">{sel.folio ?? `#${sel.id}`}</div>
            </div>
            <div className="text-[13px]">
              <div className="text-muted text-[12px]">Titular</div>
              <div>{sel.titular} <span className="text-muted">({sel.sujeto})</span></div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Línea de tiempo (simple) */}
            <div className="border rounded-2 overflow-hidden">
              <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Línea de tiempo</div>
              <ul className="divide-y">
                {rows.length === 0 ? (
                  <li className="p-4 text-[13px] text-muted">Sin eventos.</li>
                ) : rows.map(ev => (
                  <li key={ev.id} className="p-3 grid gap-1">
                    <div className="text-[12px] text-muted">{new Date(ev.created_at).toLocaleString()}</div>
                    <div className="text-[13px] font-medium">{ev.evento}</div>
                    {ev.meta && (
                      <div className="text-[12px] text-muted">
                        {renderMeta(ev.meta)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Tabla */}
            <div className="border rounded-2 overflow-hidden">
              <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Eventos</div>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Evento</th>
                    <th>Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin eventos.</td></tr>
                  ) : rows.map(ev => (
                    <tr key={ev.id}>
                      <td className="text-[13px]">{new Date(ev.created_at).toLocaleString()}</td>
                      <td className="text-[13px]">{ev.evento}</td>
                      <td className="text-[12px] text-muted">{renderMeta(ev.meta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function renderMeta(meta: any) {
  try {
    const obj = typeof meta === "string" ? JSON.parse(meta) : meta;
    if (!obj || typeof obj !== "object") return "—";
    // formateo amigable
    return Object.entries(obj).map(([k,v]) => `${k}: ${v}`).join(" | ");
  } catch {
    return String(meta ?? "—");
  }
}
