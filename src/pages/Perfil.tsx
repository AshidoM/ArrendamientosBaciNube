// src/pages/Perfil.tsx
import { useEffect, useMemo, useState } from "react";
import { getUser, type AppUser } from "../auth";
import { supabase } from "../lib/supabase";
import { uploadUserAvatar, getPublicUrl } from "../lib/storage";
import { Upload, Edit3, Save, X, Lock, ExternalLink, Trash2 } from "lucide-react";
import DocumentsTable, { type DocItem } from "../components/DocumentsTable";

type Row = AppUser & {
  telefono: string | null;
  foto_url: string | null;
  nombre_completo: string;
  ine: string | null;
};

type Tab = "datos" | "docs";

export default function Perfil() {
  const [me, setMe] = useState<Row | null>(null);
  const [tab, setTab] = useState<Tab>("docs");
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<DocItem | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState<"datos" | "pass">("datos");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState<string>("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [eNombre, setENombre] = useState("");
  const [eCorreo, setECorreo] = useState("");
  const [eTelefono, setETelefono] = useState("");
  const [eIne, setEIne] = useState("");

  const [pwdNow, setPwdNow] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdNew2, setPwdNew2] = useState("");

  const docPrefix = useMemo(() => (me ? `Documentos/${me.id}/` : null), [me?.id]);

  useEffect(() => {
    const u = getUser();
    if (u) load(u.id);
  }, []);

  async function load(id: string) {
    const { data, error } = await supabase
      .from("users_local")
      .select("id,username,nombre_completo,rol,estado,correo,telefono,foto_url,ine")
      .eq("id", id)
      .maybeSingle();

    if (error) { setError(error.message); return; }
    if (data) {
      const row = data as Row;
      setMe(row);
      setPublicUrl(getPublicUrl(row.foto_url));
      await loadDocs(row.id);
    }
  }

  async function loadDocs(userId: string) {
    const base = `Documentos/${userId}`;
    const { data, error } = await supabase.storage
      .from("Usuarios")
      .list(base, { limit: 100, offset: 0, sortBy: { column: "updated_at", order: "desc" } });

    if (error) { setError(error.message); return; }

    const items: DocItem[] = (data || [])
      .filter(f => f.name.toLowerCase().endsWith(".pdf"))
      .map(f => {
        const path = `${base}/${f.name}`;
        return {
          name: f.name,
          path,
          url: getPublicUrl(path),
          size: f.metadata?.size,
          updated_at: f.updated_at || undefined,
        };
      });

    setDocs(items);
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    if (!me) return;
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    try {
      setSaving(true);
      const { path, publicUrl } = await uploadUserAvatar(f, me.id);
      const { error } = await supabase
        .from("users_local")
        .update({ foto_url: path, updated_at: new Date().toISOString() })
        .eq("id", me.id);

      if (error) throw error;
      setPublicUrl(publicUrl);
      setMe({ ...me, foto_url: path });

      const raw = localStorage.getItem("baci_user") || sessionStorage.getItem("baci_user");
      if (raw) {
        const s = JSON.parse(raw);
        s.foto_url = path;
        localStorage.setItem("baci_user", JSON.stringify(s));
      }
      window.dispatchEvent(new Event("baci_profile_updated"));
    } catch (err: any) {
      setError(err.message || "Error al subir la foto");
    } finally {
      setSaving(false);
    }
  }

  function openEdit() {
    if (!me) return;
    setENombre(me.nombre_completo || "");
    setECorreo(me.correo || "");
    setETelefono(me.telefono || "");
    setEIne(me.ine || "");
    setPwdNow(""); setPwdNew(""); setPwdNew2("");
    setEditTab("datos");
    setEditOpen(true);
  }

  async function saveDatos() {
    if (!me) return;
    const updates: any = {};
    if (eNombre   !== me.nombre_completo) updates.nombre_completo = eNombre;
    if (eCorreo   !== (me.correo    || "")) updates.correo  = eCorreo;
    if (eTelefono !== (me.telefono  || "")) updates.telefono = eTelefono;
    if (eIne      !== (me.ine       || "")) updates.ine = eIne;

    if (Object.keys(updates).length === 0) { setEditOpen(false); return; }

    try {
      setSaving(true);
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from("users_local").update(updates).eq("id", me.id);
      if (error) throw error;
      setMe({ ...me, ...updates });
      setEditOpen(false);
    } catch (err: any) {
      setError(err.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (!me) return;
    if (!pwdNew || pwdNew !== pwdNew2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase
        .from("users_local")
        .update({ password: pwdNew, updated_at: new Date().toISOString() })
        .eq("id", me.id);
      if (error) throw error;
      setEditOpen(false);
      setPwdNow(""); setPwdNew(""); setPwdNew2("");
    } catch (err: any) {
      setError(err.message || "Error al actualizar la contraseña");
    } finally {
      setSaving(false);
    }
  }

  function onChoosePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Sólo se permiten archivos PDF."); return;
    }
    setUploadFile(f);
    setUploadName(f.name.replace(/\.pdf$/i, ""));
    setUploadPct(null);
    setUploadOpen(true);
  }

  async function doUpload() {
    if (!me || !uploadFile) return;
    const clean = (uploadName || "documento")
      .trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const finalName = `${clean}.pdf`;
    const path = `Documentos/${me.id}/${finalName}`;

    try {
      setSaving(true);
      setUploadPct(10);
      const { error } = await supabase.storage
        .from("Usuarios")
        .upload(path, uploadFile, { contentType: "application/pdf", upsert: false });
      if (error) throw error;

      setUploadPct(90);
      await loadDocs(me.id);
      setUploadPct(100);
      setTimeout(() => { setUploadOpen(false); setUploadFile(null); }, 250);
    } catch (err: any) {
      setError(err.message || "No se pudo subir el PDF");
    } finally {
      setSaving(false);
      setTimeout(() => setUploadPct(null), 600);
    }
  }

  async function reallyDelete() {
    if (!me || !confirmDoc) return;
    try {
      setSaving(true);
      const { error } = await supabase.storage.from("Usuarios").remove([confirmDoc.path]);
      if (error) throw error;
      await loadDocs(me.id);
      setConfirmDoc(null);
    } catch (err: any) {
      setError(err.message || "No se pudo eliminar el documento");
    } finally {
      setSaving(false);
    }
  }

  if (!me) return null;

  const badge =
    <span className="badge">
      {me.rol?.toUpperCase() === "ADMIN" ? "ADMIN" : "CAPTURISTA"}
    </span>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="profile-banner" />
      <div className="profile-card">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="self-center sm:self-auto -mt-16">
            <label className="relative group cursor-pointer block">
              <div className="profile-avatar">
                {publicUrl ? (
                  <img src={publicUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-3xl font-semibold text-white bg-[var(--baci-blue)]">
                    {(me.username || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="absolute inset-0 rounded-full grid place-items-center bg-black/45 opacity-0 group-hover:opacity-100 transition">
                <span className="text-white text-xs font-semibold tracking-wide">Cambiar foto</span>
              </div>
              <input type="file" accept="image/*" hidden onChange={onPickAvatar} />
            </label>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <div className="text-[11px] uppercase tracking-wide text-muted">Arrendamientos BACI</div>
              {badge}
            </div>
            <div className="text-[22px] sm:text-2xl font-semibold">{me.username}</div>
            {me.ine && <div className="text-[12px] text-muted mt-0.5">INE: {me.ine}</div>}
          </div>

          <div className="flex gap-2 justify-center sm:justify-end">
            <button className="btn-primary !h-9 !min-h-0 !px-3 text-[12.5px]" onClick={openEdit}>
              <Edit3 className="w-4 h-4" /> Editar
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 border-b border-[var(--baci-border)]">
          <button
            className={`btn-ghost !h-9 !px-3 text-[13px] ${tab === "datos" ? "profile-tab profile-tab-active" : "profile-tab"}`}
            onClick={() => setTab("datos")}
          >Datos generales</button>
          <button
            className={`btn-ghost !h-9 !px-3 text-[13px] ${tab === "docs" ? "profile-tab profile-tab-active" : "profile-tab"}`}
            onClick={() => setTab("docs")}
          >Documentos</button>
        </div>

        {tab === "datos" ? (
          <div className="p-3 grid sm:grid-cols-2 gap-3">
            <Field label="Nombre completo"><input className="input" value={me.nombre_completo || ""} readOnly /></Field>
            <Field label="Correo"><input className="input" value={me.correo || ""} readOnly /></Field>
            <Field label="Teléfono"><input className="input" value={me.telefono || ""} readOnly /></Field>
            <Field label="INE"><input className="input" value={me.ine || ""} readOnly /></Field>
          </div>
        ) : (
          <div className="pt-2">
            <div className="mb-2 flex items-center justify-end">
              <label className="btn-primary !h-9 !px-3 text-xs cursor-pointer">
                <Upload className="w-4 h-4" /> Subir PDF
                <input type="file" accept="application/pdf" hidden onChange={onChoosePdf} />
              </label>
            </div>

            <DocumentsTable
              docs={docs}
              onView={(d) => setPreviewUrl(d.url)}
              onOpenTab={(d) => window.open(d.url, "_blank")}
              onDelete={(d) => setConfirmDoc(d)}
              searchPlaceholder="Buscar documento…"
              hideSearchIcon
              dense
            />
          </div>
        )}

        {error && <div className="mt-3 alert alert--error">{error}</div>}
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="w-[95vw] max-w-5xl h-[85vh] bg-white rounded-2 border shadow-xl overflow-hidden">
            <div className="h-11 px-3 border-b flex items-center justify-between">
              <div className="text-[13px] font-medium">Documento</div>
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setPreviewUrl(null)}>
                <X className="w-4 h-4" /> Cerrar
              </button>
            </div>
            <iframe src={previewUrl} title="PDF" className="w-full h-[calc(100%-44px)]" />
          </div>
        </div>
      )}

      {confirmDoc && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="w-[92vw] max-w-md bg-white rounded-2 border shadow-xl">
            <div className="px-4 py-3 border-b text-[13px] font-medium">Eliminar documento</div>
            <div className="p-4 text-[13px]">
              ¿Seguro que quieres eliminar <strong>{confirmDoc.name}</strong>?
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setConfirmDoc(null)}>
                Cancelar
              </button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={reallyDelete} disabled={saving}>
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="w-[92vw] max-w-md bg-white rounded-2 border shadow-xl">
            <div className="px-4 py-3 border-b text-[13px] font-medium">Subir PDF</div>
            <div className="p-4 grid gap-3">
              <div className="text-[12px] text-muted">
                Archivo: <strong>{uploadFile?.name}</strong>
              </div>
              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Nombre del documento</div>
                <input
                  className="input"
                  placeholder="ej. INE_2024"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                />
              </label>

              {uploadPct !== null && (
                <div className="w-full h-2 bg-gray-100 rounded">
                  <div className="h-2 rounded bg-[var(--baci-blue)] transition-all" style={{ width: `${uploadPct}%` }} />
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setUploadOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={doUpload} disabled={saving || !uploadName.trim()}>
                <Upload className="w-4 h-4" /> Subir
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="w-[96vw] max-w-2xl bg-white rounded-2 border shadow-xl overflow-hidden">
            <div className="h-11 px-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button className={`btn-ghost !h-8 !px-3 text-xs ${editTab === "datos" ? "nav-active" : ""}`} onClick={() => setEditTab("datos")}>
                  Datos generales
                </button>
                <button className={`btn-ghost !h-8 !px-3 text-xs ${editTab === "pass" ? "nav-active" : ""}`} onClick={() => setEditTab("pass")}>
                  <Lock className="w-4 h-4" /> Contraseña
                </button>
              </div>
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setEditOpen(false)}>
                <X className="w-4 h-4" /> Cerrar
              </button>
            </div>

            {editTab === "datos" ? (
              <div className="p-4 grid sm:grid-cols-2 gap-3">
                <Field label="Nombre completo"><input className="input" value={eNombre} onChange={(e) => setENombre(e.target.value)} /></Field>
                <Field label="Correo"><input className="input" value={eCorreo} onChange={(e) => setECorreo(e.target.value)} /></Field>
                <Field label="Teléfono"><input className="input" value={eTelefono} onChange={(e) => setETelefono(e.target.value)} /></Field>
                <Field label="INE"><input className="input" value={eIne} onChange={(e) => setEIne(e.target.value)} /></Field>
              </div>
            ) : (
              <div className="p-4 grid sm:grid-cols-3 gap-3">
                <Field label="Actual"><input className="input" type="password" value={pwdNow} onChange={(e) => setPwdNow(e.target.value)} placeholder="••••••••" /></Field>
                <Field label="Nueva"><input className="input" type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} placeholder="••••••••" /></Field>
                <Field label="Confirmar"><input className="input" type="password" value={pwdNew2} onChange={(e) => setPwdNew2(e.target.value)} placeholder="••••••••" /></Field>
                {pwdNew && pwdNew2 && pwdNew !== pwdNew2 && (
                  <div className="sm:col-span-3 alert alert--error">Las contraseñas no coinciden.</div>
                )}
              </div>
            )}

            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</button>
              {editTab === "datos" ? (
                <button className="btn-primary !h-8 !px-3 text-xs" onClick={saveDatos} disabled={saving}>
                  <Save className="w-4 h-4" /> Guardar cambios
                </button>
              ) : (
                <button className="btn-primary !h-8 !px-3 text-xs" onClick={savePassword} disabled={saving || !pwdNew || !pwdNew2}>
                  <Save className="w-4 h-4" /> Actualizar contraseña
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[12px] text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
