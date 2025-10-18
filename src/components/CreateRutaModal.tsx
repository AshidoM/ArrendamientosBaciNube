// src/components/CreateRutaModal.tsx
import { useState } from "react";
import { X, Save } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function CreateRutaModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const canSave = nombre.trim().length > 0;

  async function save() {
    if (!canSave) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from("rutas")
        .insert({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, estado: "ACTIVO" });
      if (error) throw error;
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] grid place-items-center bg-black/50">
      <div className="w-[92vw] max-w-lg bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Crear ruta</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        <div className="p-4 grid gap-3">
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Nombre</div>
            <input className="input" value={nombre} onChange={(e)=>setNombre(e.target.value)} />
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Descripción (opcional)</div>
            <textarea className="input" rows={3} value={descripcion} onChange={(e)=>setDescripcion(e.target.value)} />
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
