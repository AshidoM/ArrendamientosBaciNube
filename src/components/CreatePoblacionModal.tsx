// src/components/CreatePoblacionModal.tsx
import { useEffect, useState } from "react";
import { X, Save } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getUser, type AppUser } from "../auth";
import { assignPopulationToCapturista } from "../lib/assignments";

type Ruta = { id: number; folio: string; nombre: string };

export default function CreatePoblacionModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const me = getUser() as AppUser | null;

  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [rutaId, setRutaId] = useState<number | null>(null);

  const [nombre, setNombre] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [estadoMx, setEstadoMx] = useState("");

  const [saving, setSaving] = useState(false);
  const canSave = !!rutaId && nombre.trim() && municipio.trim() && estadoMx.trim();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("rutas")
        .select("id, folio, nombre")
        .order("id", { ascending: false });
      setRutas((data || []) as Ruta[]);
    })();
  }, []);

  async function save() {
    if (!canSave) return;
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("poblaciones")
        .insert({
          nombre: nombre.trim(),
          municipio: municipio.trim(),
          estado_mx: estadoMx.trim(),
          ruta_id: rutaId,
          estado: "ACTIVO"
        })
        .select("id")
        .single();

      if (error) throw error;

      // si fue creada por una capturista => asignación automática
      if (me && me.rol === "CAPTURISTA" && data?.id) {
        await assignPopulationToCapturista(me.id, data.id);
      }

      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-2xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Crear población</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        <div className="p-4 grid sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <div className="text-[12px] text-gray-600 mb-1">Ruta</div>
            <select className="input" value={rutaId ?? ""} onChange={(e)=>setRutaId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Selecciona ruta…</option>
              {rutas.map(r => (
                <option key={r.id} value={r.id}>{r.folio} — {r.nombre}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Nombre</div>
            <input className="input" value={nombre} onChange={(e)=>setNombre(e.target.value)} />
          </label>

          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Municipio</div>
            <input className="input" value={municipio} onChange={(e)=>setMunicipio(e.target.value)} />
          </label>

          <label className="block sm:col-span-2">
            <div className="text-[12px] text-gray-600 mb-1">Estado (MX)</div>
            <input className="input" value={estadoMx} onChange={(e)=>setEstadoMx(e.target.value)} placeholder="p. ej. CHIAPAS" />
          </label>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
          <button className="btn-primary !h-8 !px-3 text-xs" onClick={save} disabled={!canSave || saving}>
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
