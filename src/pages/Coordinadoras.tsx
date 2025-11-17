// src/pages/Coordinadoras.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { getPublicUrl } from "../lib/storage";
import {
  Eye, Edit3, MoreVertical, Trash2, Power, Plus, X, Save, FileUp, ExternalLink
} from "lucide-react";
import { useConfirm } from "../components/Confirm";
import useToast from "../components/Toast";
import SelectAvalesModal from "../components/SelectAvalesModal";

/* =========================== Tipos =========================== */
type Coordinadora = {
  id: number;
  folio: string | null;
  nombre: string;
  ine: string | null;
  telefono: string | null;
  correo: string | null;
  fecha_nacimiento: string | null;
  direccion: string | null;
  estado: "ACTIVO" | "INACTIVO";
  poblacion_id: number | null;
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

/* =========================== Página =========================== */
export default function Coordinadoras() {
  const [rows, setRows] = useState<Coordinadora[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [q, setQ] = useState("");

  const [menu, setMenu] = useState<{open:boolean;x:number;y:number; row?:Coordinadora}>({open:false,x:0,y:0});

  const [viewRow, setViewRow] = useState<Coordinadora|null>(null);
  const [editRow, setEditRow] = useState<Coordinadora|null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [confirm, ConfirmUI] = useConfirm();
  const { toastSuccess, toastError, ToastUI } = useToast();

  useEffect(() => {
    const close = () => setMenu(s => ({ ...s, open: false }));
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("click", close);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  const closeMenu = useCallback(() => setMenu(s => ({ ...s, open: false })), []);

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("coordinadoras")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    const qq = q.trim();
    if (qq) query = query.or(`nombre.ilike.%${qq}%,folio.ilike.%${qq}%,ine.ilike.%${qq}%`);

    const { data, error, count } = await query.range(from, to);
    if (error) {
      toastError(error.message || "No se pudo cargar el listado", "Error");
      return;
    }
    setRows((data || []) as any);
    setTotal(count ?? (data?.length ?? 0));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, q]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function openMenuFor(btn: HTMLButtonElement, row: Coordinadora) {
    const r = btn.getBoundingClientRect();
    setMenu({ open: true, x: Math.min(window.innerWidth - 220, r.right - 200), y: r.bottom + 6, row });
  }

  async function toggleEstado(row: Coordinadora) {
    closeMenu();
    const want = row.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const ok = await confirm({
      title: want === "INACTIVO" ? "Marcar como INACTIVO" : "Marcar como ACTIVO",
      message: <>¿Seguro que quieres marcar a <b>{row.nombre}</b> como <b>{want}</b>?</>,
      confirmText: "Confirmar",
      tone: want === "INACTIVO" ? "warn" : "default",
    });
    if (!ok) return;
    const { error } = await supabase.from("coordinadoras").update({ estado: want }).eq("id", row.id);
    if (error) {
      toastError(error.message || "No se pudo cambiar el estado", "Error");
      return;
    }
    toastSuccess(`Estado actualizado a ${want}`, "Listo");
    load();
  }

  async function removeRow(row: Coordinadora) {
    closeMenu();
    const ok = await confirm({
      title: "Eliminar coordinadora",
      message: <>¿Eliminar a <b>{row.nombre}</b>? Esta acción no se puede deshacer.</>,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("coordinadoras").delete().eq("id", row.id);
    if (error) {
      toastError(error.message || "No se pudo eliminar", "Error");
      return;
    }
    toastSuccess("Eliminada correctamente", "Listo");
    load();
  }

  return (
    <div className="max-w-[1200px]">
      {ConfirmUI}
      {ToastUI}

      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar coordinadora…"
            value={q}
            onChange={(e)=>{ setPage(1); setQ(e.target.value); }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select
              className="input input--sm"
              value={pageSize}
              onChange={(e)=>{ setPage(1); setPageSize(parseInt(e.target.value)); }}
            >
              {[5,8,10,15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary btn--sm" onClick={()=>setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Crear coordinadora
            </button>
          </div>
        </div>
      </div>

      <div className="table-frame">
        <table className="min-w-full">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Nombre</th>
              <th>INE</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin resultados.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px]">{r.folio ?? "—"}</td>
                <td className="text-[13px]">{r.nombre}</td>
                <td className="text-[13px]">{r.ine ?? "—"}</td>
                <td className="text-[13px]">
                  {r.estado === "ACTIVO"
                    ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span>
                    : <span className="text-gray-500">INACTIVO</span>}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-outline btn--sm" onClick={()=>setViewRow(r)}>
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" onClick={()=>setEditRow(r)}>
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-outline btn--sm"
                      onClick={(e)=>{ e.stopPropagation(); openMenuFor(e.currentTarget, r); }}
                      title="Más acciones"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${(page-1)*pageSize + 1}–${Math.min(page*pageSize, total)}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>
            Anterior
          </button>
          <span className="text-[12.5px]">Página</span>
          <input
            className="input input--sm input--pager"
            value={page}
            onChange={(e)=> {
              const v = parseInt(e.target.value||"1",10);
              setPage(Number.isNaN(v) ? 1 : Math.max(1, Math.min(v, pages)));
            }}
          />
          <span className="text-[12.5px]">de {pages}</span>
          <button className="btn-outline btn--sm" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>
            Siguiente
          </button>
        </div>
      </div>

      {menu.open && menu.row && createPortal(
        <div
          className="portal-menu"
          style={{ left: menu.x, top: menu.y, zIndex: 10020, position: "fixed", minWidth: 220 }}
          onClick={(e)=>e.stopPropagation()}
        >
          <button className="portal-menu__item" onClick={()=>{ closeMenu(); setEditRow(menu.row!); }}>
            <Edit3 className="w-4 h-4" /> Editar
          </button>
          <button className="portal-menu__item" onClick={()=> toggleEstado(menu.row!)}>
            <Power className="w-4 h-4" /> {menu.row.estado==="ACTIVO"?"Marcar INACTIVO":"Marcar ACTIVO"}
          </button>
          <button className="portal-menu__item portal-menu__item--danger" onClick={()=> removeRow(menu.row!)}>
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>,
        document.body
      )}

      {viewRow && <ViewCoordinadora row={viewRow} onClose={()=>setViewRow(null)} />}
      {editRow && (
        <UpsertCoordinadora
          initial={editRow}
          onSaved={()=>{ setEditRow(null); load(); }}
          onClose={()=>setEditRow(null)}
        />
      )}
      {createOpen && (
        <UpsertCoordinadora
          onSaved={()=>{ setCreateOpen(false); load(); }}
          onClose={()=>setCreateOpen(false)}
        />
      )}
    </div>
  );
}

/* =========================== Ver =========================== */
function ViewCoordinadora({ row, onClose }: { row: Coordinadora; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10010] grid place-items-center bg-black/50">
      <div className="w-[92vw] max-w-xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="modal-head">
          <div className="text-[13px] font-medium">Coordinadora</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>
        <div className="p-4 grid gap-2 text-[13px]">
          <div><strong>Folio:</strong> {row.folio ?? "—"}</div>
          <div><strong>Nombre:</strong> {row.nombre}</div>
          <div><strong>INE:</strong> {row.ine ?? "—"}</div>
          <div><strong>Teléfono:</strong> {row.telefono ?? "—"}</div>
          <div><strong>Correo:</strong> {row.correo ?? "—"}</div>
          <div><strong>Fecha de nacimiento:</strong> {row.fecha_nacimiento ? row.fecha_nacimiento.slice(0,10) : "—"}</div>
          <div><strong>Dirección:</strong> {row.direccion ?? "—"}</div>
          <div><strong>Estado:</strong> {row.estado}</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== Crear/Editar (Tabs) ===================== */
function UpsertCoordinadora({
  initial,
  onSaved,
  onClose
}: {
  initial?: Partial<Coordinadora>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"datos"|"avales"|"docs">("datos");
  const [form, setForm] = useState<Partial<Coordinadora>>({
    nombre: initial?.nombre ?? "",
    ine: initial?.ine ?? "",
    telefono: initial?.telefono ?? "",
    correo: initial?.correo ?? "",
    fecha_nacimiento: initial?.fecha_nacimiento ?? "",
    direccion: initial?.direccion ?? "",
    estado: initial?.estado ?? "ACTIVO",
  });
  const [id, setId] = useState<number | null>(initial?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [gotoAfterSave, setGotoAfterSave] = useState<null | "avales" | "docs">(null);

  const [confirm] = useConfirm();
  const { toastSuccess, toastError } = useToast();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => { if (id) loadDocs(id); /* eslint-disable-next-line */ }, [id]);

  async function loadDocs(personaId: number) {
    const { data, error } = await supabase
      .from("docs_personas")
      .select("*")
      .eq("persona_tipo", "COORDINADORA")
      .eq("persona_id", personaId)
      .order("created_at", { ascending: false });
    if (error) {
      toastError(error.message || "No se pudieron cargar documentos", "Error");
      return;
    }
    setDocs((data || []) as any);
  }

  async function saveDatos({ silent = false, closeOnSuccess = false }: { silent?: boolean; closeOnSuccess?: boolean } = {}): Promise<boolean> {
    if (!form.nombre?.trim()) {
      toastError("El nombre es obligatorio", "Faltan datos");
      return false;
    }
    setSaving(true);
    try {
      if (id) {
        const { error } = await supabase.from("coordinadoras").update({
          nombre: form.nombre,
          ine: form.ine || null,
          telefono: form.telefono || null,
          correo: form.correo || null,
          fecha_nacimiento: form.fecha_nacimiento || null,
          direccion: form.direccion || null,
          estado: form.estado,
        }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("coordinadoras").insert({
          nombre: form.nombre,
          ine: form.ine || null,
          telefono: form.telefono || null,
          correo: form.correo || null,
          fecha_nacimiento: form.fecha_nacimiento || null,
          direccion: form.direccion || null,
          estado: form.estado,
          poblacion_id: null,
        }).select("id").single();
        if (error) throw error;
        setId(data!.id as number);
      }

      if (!silent) toastSuccess("Coordinadora guardada", "Listo");

      if (gotoAfterSave) {
        const target = gotoAfterSave;
        setGotoAfterSave(null);
        setTab(target);
        return true;
      }

      if (closeOnSuccess) {
        onSaved();
        onClose();
      }

      return true;
    } catch (e: any) {
      toastError(e?.message || "No se pudo guardar", "Error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function ensureCreatedThen(target: "avales" | "docs") {
    if (id) {
      setTab(target);
      return;
    }
    setGotoAfterSave(target);
    const ok = await saveDatos({ silent: true, closeOnSuccess: false });
    if (ok) {
      toastSuccess("Guardado inicial creado, ahora agrega información", "Listo");
    } else {
      setGotoAfterSave(null);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value="";
    if (!f) return;
    if (f.type !== "application/pdf") {
      toastError("Sólo se permiten archivos PDF", "Formato no válido");
      return;
    }
    setFile(f);
    setDocName(f.name.replace(/\.pdf$/i,""));
  }

  async function uploadDoc() {
    if (!id || !file) return;
    const clean = (docName || "documento").trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_\-\.]/g,"");
    const final = `${clean}.pdf`;
    const path = `Personas/COORDINADORA/${id}/${final}`;
    try {
      setSaving(true); setPct(10);
      const { error } = await supabase.storage.from("Personas").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      const url = getPublicUrl(path);
      setPct(90);
      const { error: err2 } = await supabase.from("docs_personas").insert({
        persona_tipo: "COORDINADORA", persona_id: id, tipo_doc: "OTRO", url, mime_type: "application/pdf", size_bytes: file.size
      });
      if (err2) throw err2;
      setPct(100);
      await loadDocs(id);
      setTimeout(()=>{ setFile(null); setDocName(""); setPct(null); }, 300);
      toastSuccess("Documento cargado", "Listo");
    } catch (e: any) {
      toastError(e?.message || "No se pudo subir el documento", "Error");
    } finally { setSaving(false); }
  }

  async function delDoc(d: DocRow) {
    const ok = await confirm({
      title: "Eliminar documento",
      message: "¿Deseas eliminar este documento?",
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const key = new URL(d.url).pathname.replace(/^\/storage\/v1\/object\/public\//, "");
      await supabase.storage.from("Personas").remove([key]);
    } catch { /* no-op */ }
    await supabase.from("docs_personas").delete().eq("id", d.id);
    if (id) loadDocs(id);
    toastSuccess("Documento eliminado", "Listo");
  }

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="datos"?"nav-active":""}`} onClick={()=>setTab("datos")}>
              Datos
            </button>
            <button
              className={`btn-ghost !h-8 !px-3 text-xs ${tab==="avales"?"nav-active":""}`}
              onClick={()=> ensureCreatedThen("avales")}
              title={!id ? "Se guardará primero para habilitar Avales" : ""}
            >
              Avales
            </button>
            <button
              className={`btn-ghost !h-8 !px-3 text-xs ${tab==="docs"?"nav-active":""}`}
              onClick={()=> ensureCreatedThen("docs")}
              title={!id ? "Se guardará primero para habilitar Documentos" : ""}
            >
              Documentos
            </button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={()=>{ onSaved(); onClose(); }}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

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
              <Field label="Fecha de nacimiento">
                <input type="date" className="input" value={(form.fecha_nacimiento||"").slice(0,10)} onChange={(e)=>setForm(f=>({...f, fecha_nacimiento:e.target.value||null}))}/>
              </Field>
              <Field label="Estado">
                <select className="input" value={form.estado as string} onChange={(e)=>setForm(f=>({...f, estado:e.target.value as any}))}>
                  <option>ACTIVO</option>
                  <option>INACTIVO</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Dirección">
                  <input className="input" value={form.direccion as string} onChange={(e)=>setForm(f=>({...f, direccion:e.target.value}))}/>
                </Field>
              </div>
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={()=>{ onSaved(); onClose(); }}>Cancelar</button>
              <button
                className="btn-primary !h-8 !px-3 text-xs"
                onClick={()=> saveDatos({ silent: false, closeOnSuccess: true })}
                disabled={saving}
              >
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          </>
        )}

        {tab==="avales" && id && (
          <div className="p-3">
            <SelectAvalesModal
              personaTipo="COORDINADORA"
              personaId={id}
              onClose={()=>setTab("datos")}
              onChanged={()=>{/* opcional refresco */}}
            />
          </div>
        )}

        {tab==="docs" && id && (
          <div className="p-4 grid gap-3">
            <div className="flex items-end gap-2">
              <label className="btn-outline !h-8 !px-3 text-xs cursor-pointer">
                Elegir PDF
                <input type="file" hidden accept="application/pdf" onChange={onPick} />
              </label>
              <input
                className="input input--sm"
                placeholder="Nombre del documento"
                value={docName}
                onChange={(e)=>setDocName(e.target.value)}
              />
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={uploadDoc} disabled={!file || saving}>
                <FileUp className="w-4 h-4" /> Subir
              </button>
            </div>
            {pct !== null && (
              <div className="w-full h-2 bg-gray-100 rounded">
                <div className="h-2 bg-[var(--baci-blue)]" style={{ width: `${pct}%` }}/>
              </div>
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

/* =========================== UI helpers =========================== */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[12px] text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
