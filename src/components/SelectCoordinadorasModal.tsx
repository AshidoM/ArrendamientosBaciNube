import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { X, Search, PlusCircle, Trash2 } from "lucide-react";

/** Asignar Coordinadoras a una Población
 *  - Asignar = update coordinadoras set poblacion_id = {populationId}
 *  - Quitar  = update coordinadoras set poblacion_id = null
 *
 *  Reglas UX: si no hay búsqueda, muestro SÓLO las asignadas; si hay búsqueda,
 *  muestro candidatas no asignadas (poblacion_id IS NULL) para añadir.
 */
type Props = {
  populationId: number;
  populationName?: string | null;
  onClose: () => void;
};

type Coord = {
  id: number;
  folio: string | null;
  nombre: string;
  estado: "ACTIVO" | "INACTIVO";
  poblacion_id: number | null;
};

export default function SelectCoordinadorasModal({ populationId, populationName, onClose }: Props) {
  const [assigned, setAssigned] = useState<Coord[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Coord[]>([]);
  const [loading, setLoading] = useState(false);

  // paginación 5
  const [pA, setPA] = useState(1);
  const [pR, setPR] = useState(1);
  const per = 5;
  const totA = Math.max(1, Math.ceil(assigned.length / per));
  const totR = Math.max(1, Math.ceil(results.length / per));
  const sliceA = useMemo(() => assigned.slice((pA - 1) * per, (pA - 1) * per + per), [assigned, pA]);
  const sliceR = useMemo(() => results.slice((pR - 1) * per, (pR - 1) * per + per), [results, pR]);

  useEffect(() => { loadAssigned(); /* eslint-disable-next-line */ }, [populationId]);

  async function loadAssigned() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("coordinadoras")
        .select("id, folio, nombre, estado, poblacion_id")
        .eq("poblacion_id", populationId)
        .order("id", { ascending: false })
        .limit(200);
      if (error) throw error;
      setAssigned((data || []) as Coord[]);
      setPA(1);
    } finally {
      setLoading(false);
    }
  }

  async function search() {
    const q = query.trim();
    if (!q) { setResults([]); setPR(1); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("coordinadoras")
        .select("id, folio, nombre, estado, poblacion_id")
        .or(`nombre.ilike.%${q}%,folio.ilike.%${q}%`)
        .is("poblacion_id", null)           // sólo libres
        .order("id", { ascending: false })
        .limit(100);
      if (error) throw error;
      setResults((data || []) as Coord[]);
      setPR(1);
    } finally {
      setLoading(false);
    }
  }

  async function addCoord(c: Coord) {
    const ok = window.confirm(`¿Asignar a la población "${populationName ?? populationId}"?`);
    if (!ok) return;
    const { error } = await supabase
      .from("coordinadoras")
      .update({ poblacion_id: populationId })
      .eq("id", c.id);
    if (error) { console.error(error); return; }
    await loadAssigned();
    setResults(rs => rs.filter(r => r.id !== c.id));
  }

  async function removeCoord(c: Coord) {
    const ok = window.confirm(`¿Quitar a "${c.nombre}" de esta población?`);
    if (!ok) return;
    const { error } = await supabase
      .from("coordinadoras")
      .update({ poblacion_id: null })
      .eq("id", c.id);
    if (error) { console.error(error); return; }
    await loadAssigned();
  }

  return (
    <div className="fixed inset-0 z-[9998] grid place-items-center bg-black/50" onClick={onClose}>
      <div className="w-[96vw] max-w-4xl bg-white rounded-2 border shadow-xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        {/* Head */}
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">
            Coordinadoras de <strong>{populationName ?? `Población #${populationId}`}</strong>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        <div className="p-3 grid gap-4">
          {/* Buscador */}
          <div className="flex items-end gap-2">
            <div className="relative w-full sm:max-w-xs">
              <input
                className="input"
                placeholder="Buscar coordinadora…"
                value={query}
                onChange={(e)=>setQuery(e.target.value)}
                onKeyDown={(e)=>{ if (e.key === "Enter") search(); }}
              />
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
            <button className="btn-primary btn--sm" onClick={search} disabled={loading}>Buscar</button>
          </div>

          {/* Resultados (cuando hay búsqueda) */}
          {query.trim() && (
            <div className="border rounded-2">
              <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">
                Candidatas ({results.length})
              </div>
              {sliceR.length === 0 ? (
                <div className="p-3 text-[13px] text-muted">Sin resultados.</div>
              ) : (
                <ul className="divide-y">
                  {sliceR.map(c => (
                    <li key={c.id} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium text-[13px] truncate">{c.folio ?? "—"} · {c.nombre}</div>
                      </div>
                      <button className="btn-primary btn--sm" onClick={() => addCoord(c)}>
                        <PlusCircle className="w-4 h-4" /> Añadir
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-3 py-2 border-t flex items-center gap-2 justify-end">
                <button className="btn-outline btn--sm" onClick={()=>setPR(p=>Math.max(1,p-1))} disabled={pR<=1}>Anterior</button>
                <div className="text-[12px] text-muted">Página</div>
                <input className="input input--sm !w-16 text-center" value={pR} onChange={(e)=>setPR(Math.max(1, Math.min(totR, parseInt(e.target.value||"1"))))}/>
                <div className="text-[12px] text-muted">de {totR}</div>
                <button className="btn-outline btn--sm" onClick={()=>setPR(p=>Math.min(totR,p+1))} disabled={pR>=totR}>Siguiente</button>
              </div>
            </div>
          )}

          {/* Asignadas (si no hay búsqueda, muestro lo asignado) */}
          <div className="border rounded-2">
            <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">
              Coordinadoras asignadas ({assigned.length})
            </div>
            {sliceA.length === 0 ? (
              <div className="p-3 text-[13px] text-muted">Sin coordinadoras asignadas.</div>
            ) : (
              <ul className="divide-y">
                {sliceA.map(c => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[13px] truncate">{c.folio ?? "—"} · {c.nombre}</div>
                    </div>
                    <button className="btn-ghost !h-8 !px-3 text-xs text-red-700" onClick={() => removeCoord(c)}>
                      <Trash2 className="w-4 h-4" /> Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="px-3 py-2 border-t flex items-center gap-2 justify-end">
              <button className="btn-outline btn--sm" onClick={()=>setPA(p=>Math.max(1,p-1))} disabled={pA<=1}>Anterior</button>
              <div className="text-[12px] text-muted">Página</div>
              <input className="input input--sm !w-16 text-center" value={pA} onChange={(e)=>setPA(Math.max(1, Math.min(totA, parseInt(e.target.value||"1"))))}/>
              <div className="text-[12px] text-muted">de {totA}</div>
              <button className="btn-outline btn--sm" onClick={()=>setPA(p=>Math.min(totA,p+1))} disabled={pA>=totA}>Siguiente</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
