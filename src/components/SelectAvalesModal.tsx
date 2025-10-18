// src/components/SelectAvalesModal.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { X, Plus, Trash2, FileUp, Eye, ExternalLink } from "lucide-react";
import { getPublicUrl } from "../lib/storage";

type PersonaTipo = "CLIENTE" | "COORDINADORA";

type Aval = {
  id: number;
  folio: string | null;
  nombre: string;
  estado: "ACTIVO" | "INACTIVO";
  ine: string | null;
  telefono: string | null;
  direccion: string | null;
  created_at?: string;
};

type DocRow = {
  id: number;
  tipo_doc: "INE" | "COMPROBANTE" | "OTRO";
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export default function SelectAvalesModal({
  personaTipo,
  personaId,
  onClose,
  onChanged,
}: {
  personaTipo: PersonaTipo;
  personaId: number;
  onClose: () => void;
  onChanged?: () => void; // para refrescar al volver
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Aval[]>([]);
  const [asignados, setAsignados] = useState<Aval[]>([]);
  const [saving, setSaving] = useState(false);

  // quick create
  const [createOpen, setCreateOpen] = useState(false);
  const [cNombre, setCNombre] = useState("");
  const [cINE, setCINE] = useState("");
  const [cTel, setCTel] = useState("");
  const [cDir, setCDir] = useState("");

  async function loadAsignados() {
    if (personaTipo === "CLIENTE") {
      const { data, error } = await supabase
        .from("cliente_avales")
        .select("aval_id, avales:aval_id (id, folio, nombre, estado, ine, telefono, direccion)")
        .eq("cliente_id", personaId);
      if (!error) {
        setAsignados(
          (data || [])
            .map((d: any) => d.avales)
            .filter(Boolean) as Aval[]
        );
      }
    } else {
      const { data, error } = await supabase
        .from("coordinadora_avales")
        .select("aval_id, avales:aval_id (id, folio, nombre, estado, ine, telefono, direccion)")
        .eq("coordinadora_id", personaId);
      if (!error) {
        setAsignados(
          (data || [])
            .map((d: any) => d.avales)
            .filter(Boolean) as Aval[]
        );
      }
    }
  }

  async function search() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase.from("avales")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    const qq = q.trim();
    if (qq) {
      query = query.or(`nombre.ilike.%${qq}%,ine.ilike.%${qq}%`);
    }
    const { data, error, count } = await query.range(from, to);
    if (!error) {
      setRows((data || []) as Aval[]);
      setTotal(count ?? (data?.length ?? 0));
    }
  }

  useEffect(() => { search(); /* eslint-disable-next-line */ }, [page, pageSize, q]);
  useEffect(() => { loadAsignados(); }, []); // solo una vez

  const ya = useMemo(() => new Set(asignados.map(a => a.id)), [asignados]);

  async function addAval(avalId: number) {
    if (!confirm("¿Añadir este aval?")) return;
    setSaving(true);
    try {
      if (personaTipo === "CLIENTE") {
        const { error } = await supabase.from("cliente_avales").insert({ cliente_id: personaId, aval_id: avalId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coordinadora_avales").insert({ coordinadora_id: personaId, aval_id: avalId });
        if (error) throw error;
      }
      await loadAsignados();
      onChanged?.();
      alert("Aval añadido.");
    } catch (e) {
      console.error(e);
      alert("No se pudo añadir.");
    } finally { setSaving(false); }
  }

  async function removeAval(avalId: number) {
    if (!confirm("¿Quitar este aval? (No elimina el aval, sólo lo desasigna)")) return;
    setSaving(true);
    try {
      if (personaTipo === "CLIENTE") {
        const { error } = await supabase.from("cliente_avales").delete().eq("cliente_id", personaId).eq("aval_id", avalId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coordinadora_avales").delete().eq("coordinadora_id", personaId).eq("aval_id", avalId);
        if (error) throw error;
      }
      await loadAsignados();
      onChanged?.();
      alert("Aval quitado.");
    } catch (e) {
      console.error(e);
      alert("No se pudo quitar.");
    } finally { setSaving(false); }
  }

  async function createAvalAndAttach() {
    if (!cNombre.trim()) { alert("Nombre es requerido."); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("avales").insert({
        nombre: cNombre.trim(),
        ine: cINE || null,
        telefono: cTel || null,
        direccion: cDir || null,
        estado: "ACTIVO"
      }).select("id").single();
      if (error) throw error;
      const avalId = data!.id as number;
      await addAval(avalId);
      setCreateOpen(false);
      setCNombre(""); setCINE(""); setCTel(""); setCDir("");
      await search();
    } catch (e) {
      console.error(e);
      alert("No se pudo crear el aval.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-4xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Avales ({personaTipo === "CLIENTE" ? "Cliente" : "Coordinadora"})</div>
          <div className="flex items-center gap-2">
            <button className="btn-primary !h-8 !px-3 text-xs" onClick={() => setCreateOpen(v => !v)}>
              <Plus className="w-4 h-4" /> Nuevo aval
            </button>
            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
              <X className="w-4 h-4" /> Cerrar
            </button>
          </div>
        </div>

        {/* Quick create */}
        {createOpen && (
          <div className="px-3 py-2 border-b grid sm:grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[12px] text-gray-600 mb-1">Nombre*</div>
              <input className="input" value={cNombre} onChange={(e)=>setCNombre(e.target.value)} />
            </label>
            <label className="block">
              <div className="text-[12px] text-gray-600 mb-1">INE</div>
              <input className="input" value={cINE} onChange={(e)=>setCINE(e.target.value)} />
            </label>
            <label className="block">
              <div className="text-[12px] text-gray-600 mb-1">Teléfono</div>
              <input className="input" value={cTel} onChange={(e)=>setCTel(e.target.value)} />
            </label>
            <label className="block sm:col-span-2">
              <div className="text-[12px] text-gray-600 mb-1">Dirección</div>
              <input className="input" value={cDir} onChange={(e)=>setCDir(e.target.value)} />
            </label>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={()=>setCreateOpen(false)}>Cancelar</button>
              <button className="btn-primary !h-8 !px-3 text-xs" disabled={saving} onClick={createAvalAndAttach}>
                <Plus className="w-4 h-4" /> Crear y añadir
              </button>
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className="p-3 grid gap-2 sm:grid-cols-3">
          <div className="sm:col-span-2 grid gap-2">
            <label className="block">
              <div className="text-[12px] text-gray-600 mb-1">Buscar aval (nombre o INE)</div>
              <input className="input" placeholder="Ej. Juan, INE123..." value={q} onChange={(e)=>{ setPage(1); setQ(e.target.value); }} />
            </label>
            <div className="text-[12px] text-gray-600">Resultados: {total}</div>
          </div>
          {/* Paginación derecha */}
          <div className="flex items-end justify-end gap-2">
            <select className="input input--sm w-24" value={pageSize} onChange={(e)=>{ setPage(1); setPageSize(parseInt(e.target.value)); }}>
              {[5,8,10,15].map(n => <option key={n} value={n}>{n}/página</option>)}
            </select>
            <input className="input input--sm w-16 text-center" value={page} onChange={(e)=>setPage(Math.max(1, parseInt(e.target.value||"1")))} />
            <span className="text-[12px] text-muted">de {Math.max(1, Math.ceil(total / pageSize))}</span>
          </div>
        </div>

        {/* Grid split: izquierda resultados, derecha asignados */}
        <div className="p-3 grid gap-3 sm:grid-cols-2">
          <div className="border rounded-2 overflow-hidden">
            <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Buscar / Añadir</div>
            {rows.length === 0 ? (
              <div className="p-3 text-[13px] text-muted">Sin resultados.</div>
            ) : (
              <ul className="divide-y">
                {rows.map(a => (
                  <li key={a.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{a.nombre}</div>
                      <div className="text-[12px] text-muted">Folio: {a.folio ?? "—"} {a.ine ? `• INE: ${a.ine}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DocsAvalButton avalId={a.id} />
                      {ya.has(a.id) ? (
                        <button className="btn-ghost !h-8 !px-2 text-xs text-red-700" onClick={() => removeAval(a.id)} disabled={saving}>
                          <Trash2 className="w-3.5 h-3.5" /> Quitar
                        </button>
                      ) : (
                        <button className="btn-primary !h-8 !px-2 text-xs" onClick={() => addAval(a.id)} disabled={saving}>
                          <Plus className="w-3.5 h-3.5" /> Añadir
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border rounded-2 overflow-hidden">
            <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Avales asignados</div>
            {asignados.length === 0 ? (
              <div className="p-3 text-[13px] text-muted">Ninguno asignado.</div>
            ) : (
              <ul className="divide-y">
                {asignados.map(a => (
                  <li key={a.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{a.nombre}</div>
                      <div className="text-[12px] text-muted">Folio: {a.folio ?? "—"} {a.ine ? `• INE: ${a.ine}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DocsAvalButton avalId={a.id} />
                      <button className="btn-ghost !h-8 !px-2 text-xs text-red-700" onClick={() => removeAval(a.id)} disabled={saving}>
                        <Trash2 className="w-3.5 h-3.5" /> Quitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====== Botón + modal interno de Documentos del Aval ====== */

function DocsAvalButton({ avalId }: { avalId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-outline !h-8 !px-2 text-xs" onClick={()=>setOpen(true)}>
        <FileUp className="w-3.5 h-3.5" /> Docs
      </button>
      {open && <DocsAvalModal avalId={avalId} onClose={()=>setOpen(false)} />}
    </>
  );
}

function DocsAvalModal({ avalId, onClose }: { avalId: number; onClose: () => void }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadDocs() {
    const { data, error } = await supabase
      .from("docs_personas")
      .select("*")
      .eq("persona_tipo", "AVAL")
      .eq("persona_id", avalId)
      .order("created_at", { ascending: false });
    if (!error) setDocs((data || []) as any);
  }
  useEffect(() => { loadDocs(); }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.type !== "application/pdf") { alert("Sólo PDF."); return; }
    setFile(f);
    setName(f.name.replace(/\.pdf$/i, ""));
  }

  async function upload() {
    if (!file) return;
    const clean = (name || "documento").trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_\-\.]/g,"");
    const final = `${clean}.pdf`;
    const path = `Personas/AVAL/${avalId}/${final}`;
    try {
      setSaving(true); setPct(10);
      const { error } = await supabase.storage.from("Personas").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      setPct(90);
      const url = getPublicUrl(path);
      await supabase.from("docs_personas").insert({
        persona_tipo: "AVAL", persona_id: avalId, tipo_doc: "OTRO", url, mime_type: "application/pdf", size_bytes: file.size
      });
      setPct(100);
      await loadDocs();
      setTimeout(()=>{ setFile(null); setName(""); setPct(null); }, 300);
    } catch (e) {
      console.error(e); alert("No se pudo subir.");
    } finally { setSaving(false); }
  }

  async function delDoc(id: number, url: string) {
    if (!confirm("¿Eliminar documento?")) return;
    try {
      const key = new URL(url).pathname.replace(/^\/storage\/v1\/object\/public\//, "");
      await supabase.storage.from("Personas").remove([key]);
    } catch {/* ignore remove error */}
    await supabase.from("docs_personas").delete().eq("id", id);
    await loadDocs();
  }

  return (
    <div className="fixed inset-0 z-[10050] grid place-items-center bg-black/60">
      <div className="w-[92vw] max-w-2xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Documentos del aval</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        <div className="p-3 grid gap-3">
          <div className="flex items-end gap-2">
            <label className="btn-outline !h-8 !px-3 text-xs cursor-pointer">
              Elegir PDF
              <input type="file" hidden accept="application/pdf" onChange={onPick} />
            </label>
            <input className="input input--sm" placeholder="Nombre del documento" value={name} onChange={(e)=>setName(e.target.value)} />
            <button className="btn-primary !h-8 !px-3 text-xs" disabled={!file || saving} onClick={upload}>
              <FileUp className="w-4 h-4" /> Subir
            </button>
          </div>
          {pct !== null && (
            <div className="w-full h-2 bg-gray-100 rounded">
              <div className="h-2 bg-[var(--baci-blue)] transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}

          <div className="border rounded-2 overflow-hidden">
            <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Listado</div>
            {docs.length === 0 ? (
              <div className="p-3 text-[13px] text-muted">Sin documentos.</div>
            ) : (
              <ul className="divide-y">
                {docs.map(d => (
                  <li key={d.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] truncate">{d.url.split("/").pop()}</div>
                      <div className="text-[12px] text-muted">{d.tipo_doc}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a className="btn-outline !h-8 !px-2 text-xs" href={d.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" /> Abrir
                      </a>
                      <button className="btn-ghost !h-8 !px-2 text-xs text-red-700" onClick={()=>delDoc(d.id, d.url)}>
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
    </div>
  );
}
