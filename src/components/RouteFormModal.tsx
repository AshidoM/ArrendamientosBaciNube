import { useEffect, useState } from "react";
import Modal from "./Modal";
import { supabase } from "../lib/supabase";

type Ruta = {
  id?: number;
  nombre: string;
  descripcion: string | null;
  estado: "ACTIVO" | "INACTIVO";
};

export default function RouteFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Ruta;        // si viene, es editar; si no, crear
  onClose: () => void;
  onSaved: () => void;   // refrescar la lista
}) {
  const editing = !!initial?.id;
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [estado, setEstado] = useState<"ACTIVO"|"INACTIVO">(initial?.estado ?? "ACTIVO");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!nombre.trim()) { setErr("El nombre es obligatorio."); return; }
    try {
      setSaving(true);
      setErr(null);
      if (editing) {
        const { error } = await supabase
          .from("rutas")
          .update({ nombre: nombre.trim(), descripcion: descripcion || null, estado })
          .eq("id", initial!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("rutas")
          .insert({ nombre: nombre.trim(), descripcion: descripcion || null, estado: "ACTIVO" });
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "Editar ruta" : "Crear ruta"} onClose={onClose} size="sm"
      footer={
        <>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
          <button className="btn-primary !h-8 !px-3 text-xs" onClick={save} disabled={saving}>
            {editing ? "Guardar cambios" : "Crear"}
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        <label className="block">
          <div className="text-[12px] text-gray-600 mb-1">Nombre *</div>
          <input className="input" value={nombre} onChange={(e)=>setNombre(e.target.value)} />
        </label>

        <label className="block">
          <div className="text-[12px] text-gray-600 mb-1">Descripción</div>
          <input className="input" value={descripcion ?? ""} onChange={(e)=>setDescripcion(e.target.value)} />
        </label>

        {editing && (
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Estado</div>
            <select className="input" value={estado} onChange={(e)=>setEstado(e.target.value as any)}>
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </label>
        )}

        {err && <div className="alert alert--error">{err}</div>}
      </div>
    </Modal>
  );
}
