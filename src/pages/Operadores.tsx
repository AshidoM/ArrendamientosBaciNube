import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { getPublicUrl } from "../lib/storage";
import {
  Eye, Edit3, MoreVertical, Trash2, Power, Plus, X, Save, FileUp, ExternalLink, MapPin
} from "lucide-react";
import SelectPopulationsForOperatorModal from "../components/SelectPopulationsForOperatorModal";

type Operador = {
  id: number;
  folio: string | null;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  ine: string | null;
  direccion: string | null;
  fecha_nacimiento: string | null; // ISO
  estado: "ACTIVO" | "INACTIVO";
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

export default function Operadores() {
  const [rows, setRows] = useState<Operador[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [q, setQ] = useState("");

  const [menu, setMenu] = useState<{open:boolean;x:number;y:number; row?:Operador}>({open:false,x:0,y:0});

  // modales
  const [viewRow, setViewRow] = useState<Operador|null>(null);
  const [editRow, setEditRow] = useState<Operador|null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<Operador|null>(null);

  useEffect(() => {
    const close = () => setMenu(s => ({ ...s, open: false }));
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("click", close);
    };
  }, []);

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("operadores")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    const qq = q.trim();
    if (qq) query = query.or(`nombre.ilike.%${qq}%,folio.ilike.%${qq}%,ine.ilike.%${qq}%`);
    const { data, error, count } = await query.range(from, to);
    if (!error) {
      setRows((data || []) as any);
      setTotal(count ?? (data?.length ?? 0));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, q]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function openMenuFor(btn: HTMLButtonElement, row: Operador) {
    const r = btn.getBoundingClientRect();
    setMenu({ open: true, x: Math.min(window.innerWidth - 220, r.right - 200), y: r.bottom + 6, row });
  }

  async function toggleEstado(row: Operador) {
    const want = row.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    if (!confirm(`¿Seguro que quieres marcar ${want}?`)) return;
    const { error } = await supabase.from("operadores").update({ estado: want }).eq("id", row.id);
    if (!error) load();
  }

  async function removeRow(row: Operador) {
    if (!confirm("¿Eliminar operador? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from("operadores").delete().eq("id", row.id);
    if (!error) load();
  }

  return (
    <div className="max-w-[1200px]">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input className="input" placeholder="Buscar operador…" value={q} onChange={(e)=>{ setPage(1); setQ(e.target.value); }} />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select className="input input--sm" value={pageSize} onChange={(e)=>{ setPage(1); setPageSize(parseInt(e.target.value)); }}>
              {[5,8,10,15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary btn--sm" onClick={()=>setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Crear operador
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame">
        <table className="min-w-full">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Nombre</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin resultados.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px]">{r.folio ?? "—"}</td>
                <td className="text-[13px]">{r.nombre}</td>
                <td className="text-[13px]">{r.estado === "ACTIVO" ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span> : <span className="text-gray-500">INACTIVO</span>}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-outline btn--sm" onClick={()=>setViewRow(r)}><Eye className="w-3.5 h-3.5" /> Ver</button>
                    <button className="btn-primary btn--sm" onClick={()=>setEditRow(r)}><Edit3 className="w-3.5 h-3.5" /> Editar</button>
                    <button className="btn-outline btn--sm" onClick={(e)=>{ e.stopPropagation(); openMenuFor(e.currentTarget, r); }}>
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer paginación */}
      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${(page-1)*pageSize + 1}–${Math.min(page*pageSize, total)}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</button>
          <span className="text-[12.5px]">Página</span>
          <input className="input input--sm input--pager" value={page} onChange={(e)=>setPage(Math.max(1, parseInt(e.target.value||"1")))} />
          <span className="text-[12.5px]">de {pages}</span>
          <button className="btn-outline btn--sm" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Siguiente</button>
        </div>
      </div>

      {/* Portal menú (encima de todo) */}
      {menu.open && menu.row && createPortal(
        <div className="portal-menu" style={{ left: menu.x, top: menu.y }} onClick={(e)=>e.stopPropagation()}>
          <button className="portal-menu__item" onClick={()=>{ setEditRow(menu.row!); setMenu(s=>({...s,open:false})); }}>
            <Edit3 className="w-4 h-4" /> Editar
          </button>
          <button className="portal-menu__item" onClick={()=>{ setAssignFor(menu.row!); setMenu(s=>({...s,open:false})); }}>
            <MapPin className="w-4 h-4" /> Asignar poblaciones
          </button>
          <button className="portal-menu__item" onClick={()=>{ toggleEstado(menu.row!); setMenu(s=>({...s,open:false})); }}>
            <Power className="w-4 h-4" /> {menu.row.estado==="ACTIVO"?"Marcar INACTIVO":"Marcar ACTIVO"}
          </button>
          <button className="portal-menu__item portal-menu__item--danger" onClick={()=>{ removeRow(menu.row!); setMenu(s=>({...s,open:false})); }}>
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>,
        document.body
      )}

      {/* Modales */}
      {viewRow && <ViewOperador row={viewRow} onClose={()=>setViewRow(null)} />}
      {editRow && <UpsertOperador initial={editRow} onSaved={()=>{ setEditRow(null); load(); }} onClose={()=>setEditRow(null)} />}
      {createOpen && <UpsertOperador onSaved={()=>{ setCreateOpen(false); load(); }} onClose={()=>setCreateOpen(false)} />}
      {assignFor && <SelectPopulationsForOperatorModal operadorId={assignFor.id} onClose={()=>setAssignFor(null)} />}
    </div>
  );
}

/* ===== Ver ===== */
function ViewOperador({ row, onClose }: { row: Operador; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10010] grid place-items-center bg-black/50">
      <div className="w-[92vw] max-w-xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="modal-head">
          <div className="text-[13px] font-medium">Operador</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>
        <div className="p-4 grid gap-2 text-[13px]">
          <div><strong>Folio:</strong> {row.folio ?? "—"}</div>
          <div><strong>Nombre:</strong> {row.nombre}</div>
          <div><strong>INE:</strong> {row.ine ?? "—"}</div>
          <div><strong>Teléfono:</strong> {row.telefono ?? "—"}</div>
          <div><strong>Correo:</strong> {row.correo ?? "—"}</div>
          <div><strong>Dirección:</strong> {row.direccion ?? "—"}</div>
          <div><strong>Estado:</strong> {row.estado}</div>
        </div>
      </div>
    </div>
  );
}

/* ===== Crear/Editar (Tabs: Datos / Documentos) ===== */
function UpsertOperador({
  initial,
  onSaved,
  onClose
}: {
  initial?: Partial<Operador>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"datos"|"docs">("datos");
  const [form, setForm] = useState<Partial<Operador>>({
    nombre: initial?.nombre ?? "",
    telefono: initial?.telefono ?? "",
    correo: initial?.correo ?? "",
    ine: initial?.ine ?? "",
    direccion: initial?.direccion ?? "",
    fecha_nacimiento: initial?.fecha_nacimiento ?? "",
    estado: initial?.estado ?? "ACTIVO",
  });
  const [id, setId] = useState<number | null>(initial?.id ?? null);
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => { if (id) loadDocs(id); }, [id]);

  async function ensureCreated(): Promise<boolean> {
    if (id) return true;
    if (!form.nombre?.trim()) { alert("Captura el nombre del operador."); return false; }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("operadores")
        .insert({
          nombre: form.nombre,
          telefono: form.telefono || null,
          correo: form.correo || null,
          ine: form.ine || null,
          direccion: form.direccion || null,
          fecha_nacimiento: form.fecha_nacimiento || null,
          estado: form.estado
        })
        .select("id")
        .single();
      if (error) throw error;
      setId(data!.id as number);
      return true;
    } catch (e) {
      console.error(e); alert("No se pudo crear el registro.");
      return false;
    } finally { setSaving(false); }
  }

  async function saveDatos() {
    if (!form.nombre?.trim()) { alert("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      if (id) {
        const { error } = await supabase.from("operadores").update({
          nombre: form.nombre,
          telefono: form.telefono || null,
          correo: form.correo || null,
          ine: form.ine || null,
          direccion: form.direccion || null,
          fecha_nacimiento: form.fecha_nacimiento || null,
          estado: form.estado
        }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("operadores").insert({
          nombre: form.nombre,
          telefono: form.telefono || null,
          correo: form.correo || null,
          ine: form.ine || null,
          direccion: form.direccion || null,
          fecha_nacimiento: form.fecha_nacimiento || null,
          estado: form.estado
        }).select("id").single();
        if (error) throw error;
        setId(data!.id as number);
      }
      alert("Guardado.");
      onSaved();
    } catch (e) {
      console.error(e); alert("No se pudo guardar.");
    } finally { setSaving(false); }
  }

  async function loadDocs(opId: number) {
    const { data, error } = await supabase
      .from("docs_personas")
      .select("*")
      .eq("persona_tipo", "OPERADOR")
      .eq("persona_id", opId)
      .order("created_at", { ascending: false });
    if (!error) setDocs((data || []) as any);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value="";
    if (!f) return;
    if (f.type !== "application/pdf") { alert("Sólo PDF."); return; }
    setFile(f);
    setDocName(f.name.replace(/\.pdf$/i,""));
  }

  async function uploadDoc() {
    if (!id || !file) return;
    const clean = (docName || "documento").trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_\-\.]/g,"");
    const final = `${clean}.pdf`;
    const path = `Personas/OPERADOR/${id}/${final}`;
    try {
      setSaving(true); setPct(10);
      const { error } = await supabase.storage.from("Personas").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      const url = getPublicUrl(path);
      setPct(90);
      await supabase.from("docs_personas").insert({
        persona_tipo: "OPERADOR", persona_id: id, tipo_doc: "OTRO", url, mime_type: "application/pdf", size_bytes: file.size
      });
      setPct(100);
      await loadDocs(id);
      setTimeout(()=>{ setFile(null); setDocName(""); setPct(null); }, 300);
    } catch (e) {
      console.error(e); alert("No se pudo subir.");
    } finally { setSaving(false); }
  }

  async function delDoc(d: DocRow) {
    if (!confirm("¿Eliminar documento?")) return;
    try {
      const key = new URL(d.url).pathname.replace(/^\/storage\/v1\/object\/public\//, "");
      await supabase.storage.from("Personas").remove([key]);
    } catch {}
    await supabase.from("docs_personas").delete().eq("id", d.id);
    if (id) loadDocs(id);
  }

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className={`btn-ghost !h-8 !px-3 text-xs ${tab==="datos"?"nav-active":""}`}
              onClick={()=>setTab("datos")}
            >
              Datos
            </button>
            <button
              className={`btn-ghost !h-8 !px-3 text-xs ${tab==="docs"?"nav-active":""}`}
              onClick={async ()=>{ if (await ensureCreated()) setTab("docs"); }}
            >
              Documentos
            </button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        {/* TAB: DATOS */}
        {tab==="datos" && (
          <>
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              <Field label="Nombre">
                <input className="input" value={form.nombre as string} onChange={(e)=>setForm(f=>({...f, nombre:e.target.value}))}/>
              </Field>
              <Field label="INE">
                <input className="input" value={form.ine as string} onChange={(e)=>setForm(f=>({...f, ine:e.target.value}))}/>
              </Field>
              <Field label="Teléfono">
                <input className="input" value={form.telefono as string} onChange={(e)=>setForm(f=>({...f, telefono:e.target.value}))}/>
              </Field>
              <Field label="Correo">
                <input className="input" value={form.correo as string} onChange={(e)=>setForm(f=>({...f, correo:e.target.value}))}/>
              </Field>
              <Field label="Dirección">
                <input className="input" value={form.direccion as string} onChange={(e)=>setForm(f=>({...f, direccion:e.target.value}))}/>
              </Field>
              <Field label="Fecha de nacimiento">
                <input className="input" type="date" value={(form.fecha_nacimiento as string) || ""} onChange={(e)=>setForm(f=>({...f, fecha_nacimiento:e.target.value}))}/>
              </Field>
              <Field label="Estado">
                <select className="input" value={form.estado as string} onChange={(e)=>setForm(f=>({...f, estado:e.target.value as any}))}>
                  <option>ACTIVO</option>
                  <option>INACTIVO</option>
                </select>
              </Field>
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={saveDatos} disabled={saving}><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </>
        )}

        {/* TAB: DOCUMENTOS */}
        {tab==="docs" && id && (
          <div className="p-4 grid gap-3">
            <div className="flex items-end gap-2">
              <label className="btn-outline !h-8 !px-3 text-xs cursor-pointer">
                Elegir PDF
                <input type="file" hidden accept="application/pdf" onChange={onPick} />
              </label>
              <input className="input input--sm" placeholder="Nombre del documento" value={docName} onChange={(e)=>setDocName(e.target.value)} />
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={uploadDoc} disabled={!file || saving}>
                <FileUp className="w-4 h-4" /> Subir
              </button>
            </div>
            {pct !== null && (
              <div className="w-full h-2 bg-gray-100 rounded"><div className="h-2 bg-[var(--baci-blue)]" style={{ width: `${pct}%` }}/></div>
            )}
            <div className="border rounded-2 overflow-hidden">
              <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Documentos</div>
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
                        <button className="btn-ghost !h-8 !px-2 text-xs text-red-700" onClick={()=>delDoc(d)}>
                          <Trash2 className="w-3.5 h-3.5" /> Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

      </div>
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
