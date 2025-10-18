import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getPublicUrl } from "../lib/storage";
import useConfirm from "./Confirm";
import { X, Upload, ExternalLink, Trash2 } from "lucide-react";

type OwnerType = "CLIENTE" | "COORDINADORA" | "AVAL";

type DocItem = {
  name: string;
  path: string;
  url: string;
  size?: number;
  updated_at?: string;
};

const DIRS: Record<OwnerType, string> = {
  CLIENTE: "Clientes",
  COORDINADORA: "Coordinadoras",
  AVAL: "Avales",
};

function cleanDocName(s: string) {
  return (s || "documento")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-\.]/g, "");
}

export default function PersonDocumentsModal({
  ownerType,
  ownerId,
  title = "Documentos",
  onClose,
}: {
  ownerType: OwnerType;
  ownerId: number;
  title?: string;
  onClose: () => void;
}) {
  const base = useMemo(() => `${DIRS[ownerType]}/${ownerId}`, [ownerType, ownerId]);

  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [pct, setPct] = useState<number | null>(null);

  const [confirm, ConfirmUI] = useConfirm();

  async function load() {
    const { data, error } = await supabase.storage
      .from("Usuarios")
      .list(base, { limit: 100, offset: 0, sortBy: { column: "updated_at", order: "desc" } });

    if (error) return;

    const items: DocItem[] = (data || [])
      .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
      .map((f) => {
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [base]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.name.toLowerCase().includes(q));
  }, [docs, query]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.type !== "application/pdf") { alert("Sólo PDF."); return; }
    setFile(f);
    setFileName(f.name.replace(/\.pdf$/i, ""));
  }

  async function doUpload() {
    if (!file) return;
    const final = `${cleanDocName(fileName || "documento")}.pdf`;
    const path = `${base}/${final}`;

    try {
      setSaving(true);
      setPct(10);
      const { error } = await supabase.storage.from("Usuarios").upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (error) throw error;
      setPct(90);
      await load();
      setPct(100);
      setTimeout(() => { setFile(null); setFileName(""); setPct(null); }, 250);
    } catch (e: any) {
      alert(e.message || "No se pudo subir el PDF");
      setPct(null);
    } finally {
      setSaving(false);
    }
  }

  async function remove(d: DocItem) {
    const ok = await confirm({
      title: "Eliminar documento",
      message: <>¿Eliminar <strong>{d.name}</strong>? Esta acción no se puede deshacer.</>,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;

    const { error } = await supabase.storage.from("Usuarios").remove([d.path]);
    if (!error) load();
  }

  return (
    <div className="fixed inset-0 z-[10060] grid place-items-center bg-black/50" onClick={onClose}>
      <div className="w-[95vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">{title}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        {/* uploader + buscador */}
        <div className="p-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label className="btn-primary !h-9 !px-3 text-xs cursor-pointer">
              <Upload className="w-4 h-4" /> Subir PDF
              <input hidden type="file" accept="application/pdf" onChange={pick} />
            </label>
            {file && (
              <div className="flex items-center gap-2">
                <input
                  className="input !h-9 !w-48"
                  placeholder="Nombre sin .pdf"
                  value={fileName}
                  onChange={(e)=>setFileName(e.target.value)}
                />
                <button className="btn-primary !h-9 !px-3 text-xs" onClick={doUpload} disabled={saving || !fileName.trim()}>
                  Guardar
                </button>
              </div>
            )}
          </div>

          <input
            className="input !h-9 sm:!w-56"
            placeholder="Buscar documento…"
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
          />
        </div>

        {pct !== null && (
          <div className="px-3">
            <div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
          </div>
        )}

        {/* tabla simple */}
        <div className="table-frame mt-3 mx-3 mb-3">
          <table className="min-w-full">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Actualizado</th>
                <th>Tamaño</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin resultados.</td></tr>
              ) : filtered.map((d) => (
                <tr key={d.path}>
                  <td className="text-[13px]">{d.name}</td>
                  <td className="text-[13px]">{d.updated_at ? new Date(d.updated_at).toLocaleString() : "—"}</td>
                  <td className="text-[13px]">{typeof d.size === "number" ? `${(d.size/1024).toFixed(1)} KB` : "—"}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <a className="btn-outline btn--sm" href={d.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" /> Ver
                      </a>
                      <button className="btn-outline btn--sm" onClick={()=>remove(d)}>
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {ConfirmUI}
      </div>
    </div>
  );
}
