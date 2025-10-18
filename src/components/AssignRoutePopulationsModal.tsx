// src/components/AssignRoutePopulationsModal.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { X, Plus, Search, Trash2 } from "lucide-react";

type PopRow = {
  id: number;
  nombre: string;
  municipio: string;
  estado_mx: string;
};

type AssignedRow = {
  id: number;           // id de poblaciones
  nombre: string;
  municipio: string;
  estado_mx: string;
};

type Props = {
  routeId: number;
  onClose: () => void;
};

export default function AssignRoutePopulationsModal({ routeId, onClose }: Props) {
  const [assigned, setAssigned] = useState<AssignedRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [query, setQuery]   = useState("");
  const [matches, setMatches] = useState<PopRow[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useMemo(() => async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("poblaciones")
        .select("id, nombre, municipio, estado_mx")
        .eq("ruta_id", routeId)
        .order("id", { ascending: false });
      if (error) throw error;

      const rows: AssignedRow[] = (data || []).map(r => ({
        id: r.id,
        nombre: r.nombre,
        municipio: r.municipio,
        estado_mx: r.estado_mx,
      }));
      setAssigned(rows);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar.");
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!adding) return;
      const q = query.trim();
      const { data, error } = await supabase
        .from("poblaciones")
        .select("id, nombre, municipio, estado_mx, ruta_id")
        .eq("estado", "ACTIVO")
        .ilike("nombre", `%${q}%`)
        .limit(30);

      if (!alive) return;
      if (error) { setError(error.message); return; }

      const filtered: PopRow[] = (data || []).filter(p => p.ruta_id !== routeId);
      setMatches(filtered);
    })();
    return () => { alive = false; };
  }, [query, adding, routeId]);

  async function addPopulation(p: PopRow) {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("poblaciones")
        .update({ ruta_id: routeId })
        .eq("id", p.id);
      if (error) throw error;

      await refresh();
      setQuery("");
      setAdding(false);
    } catch (e: any) {
      setError(e.message || "No se pudo añadir.");
    } finally {
      setSaving(false);
    }
  }

  async function removePopulation(id: number) {
    try {
      setSaving(true);
      // Para “quitar” de la ruta, decides a dónde mandarlo.
      // Aquí lo marcamos ruta_id = null (si tu esquema lo permite).
      const { error } = await supabase
        .from("poblaciones")
        .update({ ruta_id: null })
        .eq("id", id);
      if (error) throw error;

      await refresh();
    } catch (e: any) {
      setError(e.message || "No se pudo quitar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Asignar poblaciones a la ruta</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        <div className="p-3 grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[12.5px] text-gray-600">Poblaciones de la ruta</div>
            <div className="flex gap-2">
              {!adding ? (
                <button className="btn-primary !h-8 !px-3 text-xs" onClick={() => setAdding(true)}>
                  <Plus className="w-4 h-4" /> Añadir población
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      className="input pl-8 w-64"
                      placeholder="Buscar población…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoFocus
                    />
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" />
                  </div>
                  <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => { setAdding(false); setQuery(""); setMatches([]); }}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>

          {adding && (
            <div className="border rounded-2">
              {matches.length === 0 ? (
                <div className="p-3 text-[13px] text-gray-500">Escribe para buscar…</div>
              ) : (
                <ul className="divide-y">
                  {matches.map(m => (
                    <li key={m.id} className="flex items-center justify-between p-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{m.nombre}</div>
                        <div className="text-[12px] text-gray-600 truncate">{m.municipio}, {m.estado_mx}</div>
                      </div>
                      <button className="btn-primary !h-8 !px-3 text-xs" onClick={() => addPopulation(m)} disabled={saving}>
                        Añadir
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border rounded-2">
            {loading ? (
              <div className="p-4 text-[13px] text-gray-500">Cargando…</div>
            ) : assigned.length === 0 ? (
              <div className="p-4 text-[13px] text-gray-500">Sin poblaciones.</div>
            ) : (
              <ul className="divide-y">
                {assigned.map(a => (
                  <li key={a.id} className="flex items-center justify-between p-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{a.nombre}</div>
                      <div className="text-[12px] text-gray-600 truncate">{a.municipio}, {a.estado_mx}</div>
                    </div>
                    <button
                      className="btn-outline !h-8 !px-3 text-xs"
                      onClick={() => removePopulation(a.id)}
                      disabled={saving}
                      title="Quitar de la ruta"
                    >
                      <Trash2 className="w-4 h-4" /> Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <div className="alert alert--error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
