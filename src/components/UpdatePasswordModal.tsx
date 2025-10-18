import { useState } from "react";
import Modal from "./Modal";
import { supabase } from "../lib/supabase";

export default function UpdatePasswordModal({
  userId, username, onClose, onSaved
}: {
  userId: string;
  username: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (pwd.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres."); return; }
    try {
      setSaving(true);
      setErr(null);
      // En tu tabla local: guarda en campo password (texto).
      const { error } = await supabase.from("users_local").update({
        password: pwd
      }).eq("id", userId);
      if (error) throw error;
      onSaved?.();
      onClose();
    } catch (e: any) {
      setErr(e.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Actualizar contraseña de @${username}`} onClose={onClose} size="sm"
      footer={
        <>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
          <button className="btn-primary !h-8 !px-3 text-xs" onClick={save} disabled={saving}>Guardar</button>
        </>
      }
    >
      <label className="block">
        <div className="text-[12px] text-gray-600 mb-1">Nueva contraseña</div>
        <input className="input" type="password" value={pwd} onChange={(e)=>setPwd(e.target.value)} />
      </label>
      {err && <div className="alert alert--error mt-3">{err}</div>}
    </Modal>
  );
}
