// src/pages/Clientes.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { getPublicUrl } from "../lib/storage";
import {
  Eye, Edit3, MoreVertical, Trash2, Power, Plus, X, Save, FileUp, ExternalLink
} from "lucide-react";
import { useConfirm, useToast } from "../components/Confirm";
import SelectAvalesModal from "../components/SelectAvalesModal";

/* ============================ Tipos base ============================ */
type EstadoBin = "ACTIVO" | "INACTIVO";

type Cliente = {
  id: number;
  folio: string | null;
  nombre: string;
  ine: string | null;
  direccion: string | null;
  telefono: string | null;
  estado: EstadoBin;
  created_at?: string;
};

type Aval = {
  id: number;
  folio: string | null;
  nombre: string;
  ine: string | null;
  telefono: string | null;
  direccion: string | null;
  estado: EstadoBin;
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

/* ==================================================================== */
/*                        PÁGINA PRINCIPAL (TABS)                        */
/* ==================================================================== */
export default function Clientes() {
  const [tabPage, setTabPage] = useState<"clientes" | "avales">("clientes");
  return (
    <div className="max-w-[1200px]">
    

      {/* Pestañas superiores */}
      <div className="tabs">
        <button
          className={`tab ${tabPage === "clientes" ? "tab-active" : ""}`}
          onClick={() => setTabPage("clientes")}
        >
          Clientes
        </button>
        <button
          className={`tab ${tabPage === "avales" ? "tab-active" : ""}`}
          onClick={() => setTabPage("avales")}
        >
          Avales
        </button>
      </div>

      {tabPage === "clientes" ? <ClientesTab /> : <AvalesLiteTab />}
    </div>
  );
}

/* ==================================================================== */
/*                           TAB: CLIENTES                               */
/* ==================================================================== */
function ClientesTab() {
  const [rows, setRows] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5); // por defecto 5
  const [q, setQ] = useState("");

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; row?: Cliente }>({ open: false, x: 0, y: 0 });
  const [viewRow, setViewRow] = useState<Cliente | null>(null);
  const [editRow, setEditRow] = useState<Cliente | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [confirm, ConfirmUI] = useConfirm();
  const [toast, ToastUI] = useToast();

  // cierre robusto del menú flotante
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

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("clientes")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    const term = q.trim();
    if (term) {
      query = query.or(`nombre.ilike.%${term}%,folio.ilike.%${term}%,ine.ilike.%${term}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      toast(error.message, "Error");
      return;
    }
    setRows((data || []) as any);
    setTotal(count ?? (data?.length ?? 0));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, q]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function openMenuFor(btn: HTMLButtonElement, row: Cliente) {
    const r = btn.getBoundingClientRect();
    setMenu({ open: true, x: Math.min(window.innerWidth - 220, r.right - 200), y: r.bottom + 6, row });
  }

  async function toggleEstado(row: Cliente) {
    const want: EstadoBin = row.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const ok = await confirm({
      title: want === "INACTIVO" ? "Marcar como INACTIVO" : "Marcar como ACTIVO",
      message: <>¿Seguro que quieres marcar al cliente <b>{row.nombre}</b> como <b>{want}</b>?</>,
      confirmText: "Confirmar",
      tone: want === "INACTIVO" ? "warn" : "default",
    });
    if (!ok) return;
    const { error } = await supabase.from("clientes").update({ estado: want }).eq("id", row.id);
    if (!error) { toast("Estado actualizado."); load(); } else { toast("No se pudo actualizar.", "Error"); }
  }

  async function removeRow(row: Cliente) {
    const ok = await confirm({
      title: "Eliminar cliente",
      message: <>¿Eliminar al cliente <b>{row.nombre}</b>? Esta acción no se puede deshacer.</>,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("clientes").delete().eq("id", row.id);
    if (!error) { toast("Cliente eliminado."); load(); } else { toast("No se pudo eliminar.", "Error"); }
  }

  return (
    <>
      {ConfirmUI}
      {ToastUI}

      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar cliente… (nombre, folio o INE)"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select
              className="input input--sm"
              value={pageSize}
              onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value)); }}
            >
              {[5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary btn--sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Crear cliente
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
                    <button className="btn-outline btn--sm" onClick={() => setViewRow(r)}>
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" onClick={() => setEditRow(r)}>
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-outline btn--sm"
                      onClick={(e) => { e.stopPropagation(); openMenuFor(e.currentTarget, r); }}
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

      {/* Footer paginación */}
      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            Anterior
          </button>
          <span className="text-[12.5px]">Página</span>
          <input
            className="input input--sm input--pager"
            value={page}
            onChange={(e) => {
              const v = parseInt(e.target.value || "1", 10);
              const nv = Number.isNaN(v) ? 1 : Math.max(1, Math.min(v, pages));
              setPage(nv);
            }}
          />
          <span className="text-[12.5px]">de {pages}</span>
          <button className="btn-outline btn--sm" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>
            Siguiente
          </button>
        </div>
      </div>

      {/* Portal del menú */}
      {menu.open && menu.row && createPortal(
        <div
          className="portal-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="portal-menu__item" onClick={() => { setEditRow(menu.row!); setMenu(s => ({ ...s, open: false })); }}>
            <Edit3 className="w-4 h-4" /> Editar
          </button>
          <button className="portal-menu__item" onClick={() => { toggleEstado(menu.row!); setMenu(s => ({ ...s, open: false })); }}>
            <Power className="w-4 h-4" /> {menu.row.estado === "ACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO"}
          </button>
          <button className="portal-menu__item portal-menu__item--danger" onClick={() => { removeRow(menu.row!); setMenu(s => ({ ...s, open: false })); }}>
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>,
        document.body
      )}

      {/* Modales */}
      {viewRow && <ViewClienteTabs row={viewRow} onClose={() => setViewRow(null)} />}
      {editRow && (
        <UpsertCliente
          initial={editRow}
          onSaved={() => { setEditRow(null); load(); }}
          onClose={() => setEditRow(null)}
        />
      )}
      {createOpen && (
        <UpsertCliente
          onSaved={() => { setCreateOpen(false); load(); }}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </>
  );
}

/* ================= Ver (pestañas: Cliente | Avales asignados) ================= */
function ViewClienteTabs({ row, onClose }: { row: Cliente; onClose: () => void }) {
  const [tab, setTab] = useState<"cliente" | "avales">("cliente");
  const [asignados, setAsignados] = useState<Aval[]>([]);

  useEffect(() => { loadAsignados(); /* eslint-disable-next-line */ }, [row?.id]);

  async function loadAsignados() {
    if (!row?.id) return;
    const { data } = await supabase
      .from("cliente_avales")
      .select("aval_id, avales:aval_id (id, folio, nombre, ine, telefono, direccion, estado)")
      .eq("cliente_id", row.id);
    setAsignados(((data || []) as any[]).map(d => d.avales).filter(Boolean));
  }

  return (
    <div className="modal">
      <div className="modal-card modal-card-md">
        <div className="modal-head">
          <div className="text-[13px] font-medium">Cliente</div>
          <button className="btn-ghost" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === "cliente" ? "tab-active" : ""}`} onClick={() => setTab("cliente")}>Cliente</button>
          <button className={`tab ${tab === "avales" ? "tab-active" : ""}`} onClick={() => setTab("avales")}>Avales</button>
        </div>

        {tab === "cliente" ? (
          <div className="modal-body grid gap-2 text-[13px]">
            <div className="grid grid-cols-2 gap-2">
              <div><strong>Folio:</strong> {row.folio ?? "—"}</div>
              <div><strong>Estado:</strong> {row.estado}</div>
              <div><strong>Nombre:</strong> {row.nombre}</div>
              <div><strong>INE:</strong> {row.ine ?? "—"}</div>
              <div><strong>Teléfono:</strong> {row.telefono ?? "—"}</div>
              <div className="col-span-2"><strong>Dirección:</strong> {row.direccion ?? "—"}</div>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="border rounded-2 overflow-hidden">
              <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Avales asignados</div>
              {asignados.length === 0 ? (
                <div className="p-3 text-[13px] text-muted">Sin avales asignados.</div>
              ) : (
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Nombre</th>
                      <th>INE</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asignados.map(a => (
                      <tr key={a.id}>
                        <td className="text-[13px]">{a.folio ?? "—"}</td>
                        <td className="text-[13px]">{a.nombre}</td>
                        <td className="text-[13px]">{a.ine ?? "—"}</td>
                        <td className="text-[13px]">{a.telefono ?? "—"}</td>
                        <td className="text-[13px]">{a.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= Crear/Editar (Datos | Avales | Documentos) ================= */
function UpsertCliente({
  initial,
  onSaved,
  onClose
}: {
  initial?: Partial<Cliente>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"datos" | "avales" | "docs">("datos");
  const [form, setForm] = useState<Partial<Cliente>>({
    nombre: initial?.nombre ?? "",
    ine: initial?.ine ?? "",
    direccion: initial?.direccion ?? "",
    telefono: initial?.telefono ?? "",
    estado: initial?.estado ?? "ACTIVO",
  });
  const [id, setId] = useState<number | null>(initial?.id ?? null);
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [pct, setPct] = useState<number | null>(null);

  const [avalesOpen, setAvalesOpen] = useState(false);
  const [confirm, ConfirmUI] = useConfirm();
  const [toast, ToastUI] = useToast();

  useEffect(() => { if (id != null) loadDocs(id); }, [id]);

  async function loadDocs(clienteId: number) {
    const { data, error } = await supabase
      .from("docs_personas")
      .select("*")
      .eq("persona_tipo", "CLIENTE")
      .eq("persona_id", clienteId)
      .order("created_at", { ascending: false });
    if (!error) setDocs((data || []) as any);
  }

  async function saveDatos(): Promise<number | null> {
    if (!form.nombre?.trim()) { toast("El nombre es obligatorio.", "Atención"); return null; }
    setSaving(true);
    try {
      if (id != null) {
        const { error } = await supabase.from("clientes").update({
          nombre: form.nombre,
          ine: form.ine?.trim() || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          estado: form.estado,
        }).eq("id", id);
        if (error) throw error;
        toast("Cliente actualizado.");
        return id;
      } else {
        const { data, error } = await supabase
          .from("clientes")
          .insert({
            nombre: form.nombre,
            ine: form.ine?.trim() || null,
            telefono: form.telefono || null,
            direccion: form.direccion || null,
            estado: form.estado,
          })
          .select("id")
          .single();
        if (error) throw error;
        const newId = (data as any)?.id ?? null;
        setId(newId);
        toast("Cliente creado.");
        return newId;
      }
    } catch (e: any) {
      if (e?.code === "23505") toast("La INE ya existe para otro cliente.", "Error");
      else toast(e?.message ?? "No se pudo guardar.", "Error");
      return null;
    } finally { setSaving(false); }
  }

  async function ensureSavedThen(openWhat: "avales" | "docs") {
    if (id == null) {
      const newId = await saveDatos(); // autosave
      if (newId == null) return;
      await loadDocs(newId);
      setId(newId);
    }
    if (openWhat === "avales") setAvalesOpen(true);
    if (openWhat === "docs") setTab("docs");
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.type !== "application/pdf") { toast("Sólo PDF.", "Atención"); return; }
    setFile(f);
    setDocName(f.name.replace(/\.pdf$/i, ""));
  }

  async function uploadDoc() {
    if (id == null || !file) return;
    const clean = (docName || "documento").trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const final = `${clean}.pdf`;
    const path = `Personas/CLIENTE/${id}/${final}`;
    try {
      setSaving(true); setPct(10);
      const { error } = await supabase.storage.from("Personas").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      const url = getPublicUrl(path);
      setPct(80);
      const { error: e2 } = await supabase.from("docs_personas").insert({
        persona_tipo: "CLIENTE", persona_id: id, tipo_doc: "OTRO", url, mime_type: "application/pdf", size_bytes: file.size
      });
      if (e2) throw e2;
      setPct(100);
      await loadDocs(id);
      setTimeout(() => { setFile(null); setDocName(""); setPct(null); }, 250);
      toast("Documento subido.");
    } catch (e: any) {
      toast(e?.message ?? "No se pudo subir.", "Error");
    } finally { setSaving(false); }
  }

  async function delDoc(d: DocRow) {
    const ok = await confirm({
      title: "Eliminar documento",
      message: "¿Eliminar documento?",
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const key = new URL(d.url).pathname.replace(/^\/storage\/v1\/object\/public\//, "");
      await supabase.storage.from("Personas").remove([key]);
    } catch {/* no-op */}
    await supabase.from("docs_personas").delete().eq("id", d.id);
    if (id != null) loadDocs(id);
    toast("Documento eliminado.");
  }

  return (
    <div className="modal">
      {ConfirmUI}
      {ToastUI}
      <div className="modal-card modal-card-lg">
        <div className="modal-head">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab === "datos" ? "nav-active" : ""}`} onClick={() => setTab("datos")}>
              Datos
            </button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab === "avales" ? "nav-active" : ""}`} onClick={() => ensureSavedThen("avales")}>
              Avales
            </button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab === "docs" ? "nav-active" : ""}`} onClick={() => ensureSavedThen("docs")}>
              Documentos
            </button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => { onSaved(); onClose(); }}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {/* DATOS */}
        {tab === "datos" && (
          <>
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              <Field label="Nombre*">
                <input className="input" value={form.nombre as string} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </Field>
              <Field label="INE">
                <input className="input" value={form.ine as string} onChange={(e) => setForm(f => ({ ...f, ine: e.target.value }))} />
              </Field>
              <Field label="Teléfono">
                <input className="input" value={form.telefono as string} onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </Field>
              <Field label="Dirección">
                <input className="input" value={form.direccion as string} onChange={(e) => setForm(f => ({ ...f, direccion: e.target.value }))} />
              </Field>
              <Field label="Estado">
                <select className="input" value={form.estado as string} onChange={(e) => setForm(f => ({ ...f, estado: e.target.value as any }))}>
                  <option>ACTIVO</option>
                  <option>INACTIVO</option>
                </select>
              </Field>
            </div>
            <div className="px-4 py-3 border-top flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => { onSaved(); onClose(); }}>Cancelar</button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={saveDatos} disabled={saving}>
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          </>
        )}

        {/* DOCUMENTOS */}
        {tab === "docs" && id != null && (
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
                onChange={(e) => setDocName(e.target.value)}
              />
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={uploadDoc} disabled={!file || saving}>
                <FileUp className="w-4 h-4" /> Subir
              </button>
            </div>
            {pct !== null && (
              <div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
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
                        <button className="btn-ghost !h-8 !px-2 text-xs text-red-700" onClick={() => delDoc(d)}>
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

      {/* Modal real para Avales (controlado) */}
      {avalesOpen && id != null && (
        <SelectAvalesModal
          personaTipo="CLIENTE"
          personaId={id}
          onClose={() => setAvalesOpen(false)}
          onChanged={() => { /* opcional refrescos */ }}
        />
      )}
    </div>
  );
}

/* ==================================================================== */
/*                     TAB: AVALES LITE (EMBEBIDO AQUÍ)                  */
/* ==================================================================== */
function AvalesLiteTab() {
  const [rows, setRows] = useState<Aval[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [q, setQ] = useState("");

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; row?: Aval }>({ open: false, x: 0, y: 0 });
  const [viewRow, setViewRow] = useState<Aval | null>(null);
  const [editRow, setEditRow] = useState<Aval | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [confirm, ConfirmUI] = useConfirm();
  const [toast, ToastUI] = useToast();

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

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("avales")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    const term = q.trim();
    if (term) query = query.or(`nombre.ilike.%${term}%,folio.ilike.%${term}%,ine.ilike.%${term}%`);

    const { data, error, count } = await query.range(from, to);
    if (error) { toast(error.message, "Error"); return; }
    setRows((data || []) as any);
    setTotal(count ?? (data?.length ?? 0));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, q]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function openMenuFor(btn: HTMLButtonElement, row: Aval) {
    const r = btn.getBoundingClientRect();
    setMenu({ open: true, x: Math.min(window.innerWidth - 220, r.right - 200), y: r.bottom + 6, row });
  }

  async function toggleEstado(row: Aval) {
    const want: EstadoBin = row.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const ok = await confirm({
      title: want === "INACTIVO" ? "Marcar como INACTIVO" : "Marcar como ACTIVO",
      message: <>¿Seguro que quieres marcar a <b>{row.nombre}</b> como <b>{want}</b>?</>,
      confirmText: "Confirmar",
      tone: want === "INACTIVO" ? "warn" : "default",
    });
    if (!ok) return;
    const { error } = await supabase.from("avales").update({ estado: want }).eq("id", row.id);
    if (!error) { toast("Estado actualizado."); load(); } else { toast("No se pudo actualizar.", "Error"); }
  }

  async function removeRow(row: Aval) {
    const ok = await confirm({
      title: "Eliminar aval",
      message: <>¿Eliminar a <b>{row.nombre}</b>? Esta acción no se puede deshacer.</>,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("avales").delete().eq("id", row.id);
    if (!error) { toast("Aval eliminado."); load(); } else { toast("No se pudo eliminar.", "Error"); }
  }

  return (
    <>
      {ConfirmUI}
      {ToastUI}

      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar aval… (nombre, folio o INE)"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select
              className="input input--sm"
              value={pageSize}
              onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value)); }}
            >
              {[5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary btn--sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Crear aval
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
                    <button className="btn-outline btn--sm" onClick={() => setViewRow(r)}>
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" onClick={() => setEditRow(r)}>
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-outline btn--sm"
                      onClick={(e) => { e.stopPropagation(); openMenuFor(e.currentTarget, r); }}
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

      {/* Footer paginación */}
      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            Anterior
          </button>
          <span className="text-[12.5px]">Página</span>
          <input
            className="input input--sm input--pager"
            value={page}
            onChange={(e) => {
              const v = parseInt(e.target.value || "1", 10);
              const nv = Number.isNaN(v) ? 1 : Math.max(1, Math.min(v, pages));
              setPage(nv);
            }}
          />
          <span className="text-[12.5px]">de {pages}</span>
          <button className="btn-outline btn--sm" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>
            Siguiente
          </button>
        </div>
      </div>

      {/* Portal menú */}
      {menu.open && menu.row && createPortal(
        <div
          className="portal-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="portal-menu__item" onClick={() => { setEditRow(menu.row!); setMenu(s => ({ ...s, open: false })); }}>
            <Edit3 className="w-4 h-4" /> Editar
          </button>
          <button className="portal-menu__item" onClick={() => { toggleEstado(menu.row!); setMenu(s => ({ ...s, open: false })); }}>
            <Power className="w-4 h-4" /> {menu.row.estado === "ACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO"}
          </button>
          <button className="portal-menu__item portal-menu__item--danger" onClick={() => { removeRow(menu.row!); setMenu(s => ({ ...s, open: false })); }}>
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>,
        document.body
      )}

      {/* Modales (Ver / Editar / Crear) */}
      {viewRow && <ViewAval row={viewRow} onClose={() => setViewRow(null)} />}
      {editRow && <UpsertAval initial={editRow} onSaved={() => { setEditRow(null); load(); }} onClose={() => setEditRow(null)} />}
      {createOpen && <UpsertAval onSaved={() => { setCreateOpen(false); load(); }} onClose={() => setCreateOpen(false)} />}
    </>
  );
}

/* ========================== Modales de AVAL (lite) ========================== */
function ViewAval({ row, onClose }: { row: Aval; onClose: () => void }) {
  return (
    <div className="modal">
      <div className="modal-card modal-card-md">
        <div className="modal-head">
          <div className="text-[13px] font-medium">Aval</div>
          <button className="btn-ghost" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>
        <div className="p-4 grid gap-2 text-[13px]">
          <div><strong>Folio:</strong> {row.folio ?? "—"}</div>
          <div><strong>Nombre:</strong> {row.nombre}</div>
          <div><strong>INE:</strong> {row.ine ?? "—"}</div>
          <div><strong>Teléfono:</strong> {row.telefono ?? "—"}</div>
          <div><strong>Dirección:</strong> {row.direccion ?? "—"}</div>
          <div><strong>Estado:</strong> {row.estado}</div>
        </div>
      </div>
    </div>
  );
}

function UpsertAval({
  initial,
  onSaved,
  onClose
}: {
  initial?: Partial<Aval>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Aval>>({
    nombre: initial?.nombre ?? "",
    ine: initial?.ine ?? "",
    telefono: initial?.telefono ?? "",
    direccion: initial?.direccion ?? "",
    estado: initial?.estado ?? "ACTIVO",
  });
  const [id, setId] = useState<number | null>(initial?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [confirm, ConfirmUI] = useConfirm();
  const [toast, ToastUI] = useToast();

  async function save() {
    if (!form.nombre?.trim()) { toast("El nombre es obligatorio.", "Atención"); return; }
    setSaving(true);
    try {
      if (id) {
        const { error } = await supabase.from("avales").update({
          nombre: form.nombre,
          ine: form.ine || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          estado: form.estado as EstadoBin,
        }).eq("id", id);
        if (error) throw error;
        toast("Aval actualizado.");
      } else {
        const { data, error } = await supabase.from("avales").insert({
          nombre: form.nombre,
          ine: form.ine || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          estado: form.estado as EstadoBin,
        }).select("id").single();
        if (error) throw error;
        setId((data as any).id);
        toast("Aval creado.");
      }
      onSaved();
    } catch (e: any) {
      toast(e?.message ?? "No se pudo guardar.", "Error");
    } finally { setSaving(false); }
  }

  async function toggleEstado() {
    const want: EstadoBin = (form.estado as EstadoBin) === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const ok = await confirm({
      title: want === "INACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO",
      message: `¿Seguro que quieres marcar a ${form.nombre} como ${want}?`,
      confirmText: "Confirmar",
      tone: want === "INACTIVO" ? "warn" : "default",
    });
    if (!ok) return;
    setForm(s => ({ ...s, estado: want }));
  }

  return (
    <div className="modal">
      {ConfirmUI}
      {ToastUI}
      <div className="modal-card modal-card-md">
        <div className="modal-head">
          <div className="text-[13px] font-medium">{id ? "Editar aval" : "Crear aval"}</div>
          <button className="btn-ghost" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>
        <div className="modal-body grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nombre*">
              <input className="input" value={form.nombre as string} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </Field>
            <Field label="INE">
              <input className="input" value={form.ine as string} onChange={(e) => setForm(f => ({ ...f, ine: e.target.value }))} />
            </Field>
            <Field label="Teléfono">
              <input className="input" value={form.telefono as string} onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))} />
            </Field>
            <Field label="Dirección">
              <input className="input" value={form.direccion as string} onChange={(e) => setForm(f => ({ ...f, direccion: e.target.value }))} />
            </Field>
            <Field label="Estado">
              <div className="flex gap-2">
                <select className="input" value={form.estado as string} onChange={(e) => setForm(f => ({ ...f, estado: e.target.value as any }))}>
                  <option>ACTIVO</option>
                  <option>INACTIVO</option>
                </select>
                <button className="btn-outline !h-8 !px-3 text-xs" onClick={toggleEstado}>Cambiar</button>
              </div>
            </Field>
          </div>
        </div>
        <div className="px-4 py-3 border-top flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
          <button className="btn-primary !h-8 !px-3 text-xs" onClick={save} disabled={saving}>
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================= UI helper ============================= */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[12px] text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
