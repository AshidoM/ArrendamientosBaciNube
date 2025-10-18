import { useEffect, useState } from "react";
import Modal from "./Modal";
import { supabase } from "../lib/supabase";

type Poblacion = {
  id?: number;
  nombre: string;
  municipio: string;
  estado_mx: string;
  ruta_id: number | null;
  dia_cobranza: string | null;
  estado: "ACTIVO" | "INACTIVO";
};

export default function PopulationFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Poblacion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!initial?.id;
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [municipio, setMunicipio] = useState(initial?.municipio ?? "");
  const [estadoMx, setEstadoMx] = useState(initial?.estado_mx ?? "");
  const [rutaId, setRutaId] = useState<number | "">(initial?.ruta_id ?? "");
  const [dia, setDia] = useState<string>(initial?.dia_cobranza ?? "");
  const [estado, setEstado] = useState<"ACTIVO"|"INACTIVO">(initial?.estado ?? "ACTIVO");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rutas, setRutas] = useState<Array<{id:number; nombre:string}>>([]);

  useEffect(() => {
    supabase.from("rutas").select("id, nombre").order("nombre", { ascending: true })
      .then(({ data }) => setRutas((data || []) as any));
  }, []);

  async function save() {
    if (!nombre.trim() || !municipio.trim() || !estadoMx.trim()) {
      setErr("Nombre, municipio y estado son obligatorios.");
      return;
    }
    try {
      setSaving(true);
      setErr(null);
      const payload: any = {
        nombre: nombre.trim(),
        municipio: municipio.trim(),
        estado_mx: estadoMx.trim(),
        ruta_id: rutaId === "" ? null : rutaId,
        dia_cobranza: dia || null,
      };
      if (editing) {
        payload.estado = estado;
        const { error } = await supabase.from("poblaciones").update(payload).eq("id", initial!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("poblaciones").insert({ ...payload, estado: "ACTIVO" });
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
    <Modal title={editing ? "Editar población" : "Crear población"} onClose={onClose} size="md"
      footer={
        <>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
          <button className="btn-primary !h-8 !px-3 text-xs" onClick={save} disabled={saving}>
            {editing ? "Guardar cambios" : "Crear"}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <div className="text-[12px] text-gray-600 mb-1">Nombre *</div>
          <input className="input" value={nombre} onChange={(e)=>setNombre(e.target.value)} />
        </label>

        <label className="block">
          <div className="text-[12px] text-gray-600 mb-1">Municipio *</div>
          <input className="input" value={municipio} onChange={(e)=>setMunicipio(e.target.value)} />
        </label>

        <label className="block">
          <div className="text-[12px] text-gray-600 mb-1">Estado MX *</div>
          <input className="input" value={estadoMx} onChange={(e)=>setEstadoMx(e.target.value)} />
        </label>

        <label className="block">
          <div className="text-[12px] text-gray-600 mb-1">Ruta</div>
          <select className="input" value={rutaId as any} onChange={(e)=>setRutaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">(Sin ruta)</option>
            {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>

        <label className="block">
          <div className="text-[12px] text-gray-600 mb-1">Día de cobranza</div>
          <select className="input" value={dia} onChange={(e)=>setDia(e.target.value)}>
            <option value="">(No asignado)</option>
            {["LUNES","MARTES","MIERCOLES","JUEVES","VIERNES","SABADO","DOMINGO"].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
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
      </div>

      {err && <div className="alert alert--error mt-3">{err}</div>}
    </Modal>
  );
}
