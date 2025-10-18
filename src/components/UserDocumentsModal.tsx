import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getPublicUrl } from "../lib/storage";
import { X, Eye, ExternalLink, Trash2, Upload, Search } from "lucide-react";

export type DocItem = {
  name: string;
  path: string;
  url: string;
  size?: number;
  updated_at?: string;
};

type Props = {
  userId: string;
  username?: string | null;
  onClose: () => void;
};

export default function UserDocumentsModal({ userId, username, onClose }: Props) {
  const base = useMemo(() => `Documentos/${userId}`, [userId]);

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [query, setQuery] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<DocItem | null>(null);
  const [saving, setSaving] = useState(false);

  // subir
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  async function load() {
    const { data, error } = await supabase.storage
      .from("Usuarios")
      .list(base, { limit: 200, offset: 0, sortBy: { column: "updated_at", order: "desc" } });
    if (error) throw error;

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

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(d => d.name.toLowerCase().includes(q));
  }, [docs, query]);

  function onChoosePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.type !== "application/pdf") return;
    setUploadFile(f);
    setUploadName(f.name.replace(/\.pdf$/i, ""));
    setUploadOpen(true);
  }

  async function doUpload() {
    if (!uploadFile) return;
    const clean = (uploadName || "documento")
      .trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const finalName = `${clean}.pdf`;
    const path = `${base}/${finalName}`;

    try {
      setSaving(true);
      setUploadPct(10);
      const { error } = await supabase.storage
        .from("Usuarios")
        .upload(path, uploadFile, { contentType: "application/pdf", upsert: false });
      if (error) throw error;

      setUploadPct(90);
      await load();
      setUploadPct(100);
      setTimeout(() => { setUploadOpen(false); setUploadFile(null); }, 250);
    } catch {
      // ignora
    } finally {
      setSaving(false);
      setTimeout(() => setUploadPct(null), 600);
    }
  }

  async function reallyDelete() {
    if (!confirmDoc) return;
    try {
      setSaving(true);
      const { error } = await supabase.storage.from("Usuarios").remove([confirmDoc.path]);
      if (error) throw error;
      await load();
      setConfirmDoc(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-4xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            Documentos de <span className="font-semibold">@{username ?? "usuario"}</span>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        <div className="p-3 grid gap-3">
          {/* barra de búsqueda + subir */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <input
                className="input pl-8"
                placeholder="Buscar documento…"
                value={query}
                onChange={(e)=>setQuery(e.target.value)}
              />
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>

            <label className="btn-primary !h-9 !px-3 text-xs cursor-pointer">
              <Upload className="w-4 h-4" /> Subir PDF
              <input type="file" accept="application/pdf" hidden onChange={onChoosePdf} />
            </label>
          </div>

          {/* listado */}
          <div className="border rounded-2">
            {filtered.length === 0 ? (
              <div className="p-4 text-[13px] text-gray-500">Sin documentos.</div>
            ) : (
              <ul className="divide-y">
                {filtered.map(d => (
                  <li key={d.path} className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{d.name}</div>
                      {d.updated_at && (
                        <div className="text-[12px] text-gray-600">
                          {new Date(d.updated_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="btn-primary !h-8 !px-2 text-xs" onClick={() => setPreviewUrl(d.url)}>
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </button>
                      <a className="btn-outline !h-8 !px-2 text-xs" target="_blank" rel="noreferrer" href={d.url}>
                        <ExternalLink className="w-3.5 h-3.5" /> Pestaña
                      </a>
                      <button className="btn-ghost !h-8 !px-2 text-xs text-red-700" onClick={() => setConfirmDoc(d)}>
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* visor */}
      {previewUrl && (
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/50">
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

      {/* confirmar eliminar */}
      {confirmDoc && (
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/60">
          <div className="w-[92vw] max-w-md bg-white rounded-2 border shadow-xl">
            <div className="px-4 py-3 border-b text-[13px] font-medium">Eliminar documento</div>
            <div className="p-4 text-[13px]">¿Seguro que quieres eliminar <strong>{confirmDoc.name}</strong>?</div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setConfirmDoc(null)}>Cancelar</button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={reallyDelete} disabled={saving}>
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* subir/renombrar */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/60">
          <div className="w-[92vw] max-w-md bg-white rounded-2 border shadow-xl">
            <div className="px-4 py-3 border-b text-[13px] font-medium">Subir PDF</div>
            <div className="p-4 grid gap-3">
              <div className="text-[12px] text-gray-600">
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
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setUploadOpen(false)} disabled={saving}>Cancelar</button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={doUpload} disabled={saving || !uploadName.trim()}>
                <Upload className="w-4 h-4" /> Subir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
