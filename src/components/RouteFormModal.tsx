// src/components/RouteFormModal.tsx
import { useState } from "react";
import { Save, X } from "lucide-react";
import { supabase } from "../lib/supabase";

export type RutaForm = {
  id?: number;
  folio?: string | null;
  nombre?: string;
  descripcion?: string | null;
  estado?: "ACTIVO" | "INACTIVO";
};

export default function RouteFormModal({
  initial,
  onSaved,
  onClose,
}: {
  initial?: RutaForm;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RutaForm>({
    nombre: initial?.nombre ?? "",
    descripcion: initial?.descripcion ?? "",
    estado: initial?.estado ?? "ACTIVO",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      if (initial?.id) {
        const { error } = await supabase
          .from("rutas")
          .update({
            nombre: form.nombre,
            descripcion: form.descripcion || null,
            estado: form.estado,
          })
          .eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("rutas")
          .insert({
            nombre: form.nombre,
            descripcion: form.descripcion || null,
            estado: form.estado,
          });
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="modal-card modal-card-md">
        <div className="modal-head">
          <div className="text-[13px] font-medium">
            {initial?.id ? "Editar ruta" : "Crear ruta"}
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        <div className="p-4 grid gap-3 text-[13px]">
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Nombre</div>
            <input
              className="input"
              value={form.nombre ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </label>

          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Descripción</div>
            <textarea
              className="input"
              rows={3}
              value={form.descripcion ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, descripcion: e.target.value }))
              }
            />
          </label>

          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Estado</div>
            <select
              className="input"
              value={form.estado}
              onChange={(e) =>
                setForm((f) => ({ ...f, estado: e.target.value as any }))
              }
            >
              <option>ACTIVO</option>
              <option>INACTIVO</option>
            </select>
          </label>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary !h-8 !px-3 text-xs nowrap"
            onClick={submit}
            disabled={saving}
          >
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
