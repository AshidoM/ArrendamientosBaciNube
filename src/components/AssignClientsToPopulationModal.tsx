import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import Modal from "./Modal";
import { Search, Plus, Trash2 } from "lucide-react";

type ClientRow = {
  id: number;
  nombre: string;             // nombre completo
  telefono: string | null;    // si existe
  poblacion_id: number | null;
};

export default function AssignClientsToPopulationModal({
  populationId,
  onClose
}: {
  populationId: number;
  onClose: () => void;
}) {
  const [list, setList] = useState<ClientRow[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre, telefono, poblacion_id")
      .order("id", { ascending: false })
      .limit(500);
    if (error) { setErr(error.message); return; }
    setList((data || []) as any);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(c => {
      const name = (c.nombre ?? "").toLowerCase();
      const tel  = (c.telefono ?? "").toLowerCase();
      return name.includes(s) || tel.includes(s);
    });
  }, [list, q]);

  async function assign(c: ClientRow) {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("clientes")
        .update({ poblacion_id: populationId })
        .eq("id", c.id);
      if (error) throw error;
      await load();
    } catch (e: any) { setErr(e.message || "No se pudo asignar."); }
    finally { setSaving(false); }
  }

  async function unassign(c: ClientRow) {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("clientes")
        .update({ poblacion_id: null })
        .eq("id", c.id)
        .eq("poblacion_id", populationId);
      if (error) throw error;
      await load();
    } catch (e: any) { setErr(e.message || "No se pudo quitar."); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Asignar clientes a la población" onClose={onClose} size="lg">
      <div className="grid gap-3">
        <div className="relative w-full sm:max-w-xs">
          <input className="input pl-8" placeholder="Buscar cliente…" value={q} onChange={(e)=>setQ(e.target.value)} />
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
        </div>

        <div className="border rounded-2">
          {filtered.length === 0 ? (
            <div className="p-4 text-[13px] text-gray-500">Sin resultados.</div>
          ) : (
            <ul className="divide-y">
              {filtered.map(c => {
                const isAssigned = c.poblacion_id === populationId;
                return (
                  <li key={c.id} className="flex items-center justify-between p-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{c.nombre || `#${c.id}`}</div>
                      <div className="text-[12px] text-gray-600 truncate">{c.telefono ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isAssigned ? (
                        <button className="btn-primary !h-8 !px-3 text-xs" onClick={() => assign(c)} disabled={saving}>
                          <Plus className="w-4 h-4" /> Asignar
                        </button>
                      ) : (
                        <button className="btn-outline !h-8 !px-3 text-xs" onClick={() => unassign(c)} disabled={saving}>
                          <Trash2 className="w-4 h-4" /> Quitar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {err && <div className="alert alert--error">{err}</div>}
      </div>
    </Modal>
  );
}
