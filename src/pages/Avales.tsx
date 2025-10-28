// src/pages/Avales.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import {
  Eye, Edit3, MoreVertical, Trash2, Power, Plus, X, Save, ExternalLink
} from "lucide-react";
import { useConfirm, useToast } from "../components/Confirm";

type Aval = {
  id: number;
  folio: string | null;
  nombre: string;
  ine: string | null;
  telefono: string | null;
  direccion: string | null;
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

export default function Avales() {
  const [rows, setRows] = useState<Aval[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5); // default 5
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
    if (error) { toast("No se pudo cargar la lista de avales.", "Error"); return; }
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
    const want = row.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const ok = await confirm({
      title: want === "INACTIVO" ? "Marcar como INACTIVO" : "Marcar como ACTIVO",
      message: <>¿Seguro que quieres marcar a <b>{row.nombre}</b> como <b>{want}</b>?</>,
      confirmText: "Confirmar",
      tone: want === "INACTIVO" ? "warn" : "default",
    });
    if (!ok) return;
    const { error } = await supabase.from("avales").update({ estado: want }).eq("id", row.id);
    if (error) { toast("No se pudo actualizar el estado.", "Error"); return; }
    toast("Estado actualizado.");
    load();
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
    if (error) { toast("No se pudo eliminar. Verifica dependencias.", "Error"); return; }
    toast("Aval eliminado.");
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
            placeholder="Buscar aval…"
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
              const next = Number.isNaN(v) ? 1 : Math.max(1, Math.min(v, pages));
              setPage(next);
            }}
          />
          <span className="text-[12.5px]">de {pages}</span>
          <button className="btn-outline btn--sm" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>
            Siguiente
          </button>
        </div>
      </div>

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

      {viewRow && <ViewAval row={viewRow} onClose={() => setViewRow(null)} />}
      {editRow && (
        <UpsertAval
          initial={editRow}
          onSaved={() => { setEditRow(null); load(); }}
          onClose={() => setEditRow(null)}
        />
      )}
      {createOpen && (
        <UpsertAval
          onSaved={() => { setCreateOpen(false); load(); }}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------------- Ver (con clientes que usan el aval) ---------------- */
function ViewAval({ row, onClose }: { row: Aval; onClose: () => void }) {
  const [clientes, setClientes] = useState<Array<{ id: number; folio: string | null; nombre: string; ine: string | null; telefono: string | null }>>([]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("cliente_avales")
        .select("cliente_id, clientes:cliente_id (id, folio, nombre, ine, telefono)")
        .eq("aval_id", row.id);
      if (!error) setClientes(((data || []) as any[]).map(d => d.clientes).filter(Boolean));
    };
    load();
  }, [row.id]);

  return (
    <div className="fixed inset-0 z-[10010] grid place-items-center bg-black/50">
      <div className="w-[92vw] max-w-2xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="modal-head">
          <div className="text-[13px] font-medium">Aval</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>
        <div className="p-4 grid gap-4 text-[13px]">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><strong>Folio:</strong> {row.folio ?? "—"}</div>
            <div><strong>Estado:</strong> {row.estado}</div>
            <div><strong>Nombre:</strong> {row.nombre}</div>
            <div><strong>INE:</strong> {row.ine ?? "—"}</div>
            <div><strong>Teléfono:</strong> {row.telefono ?? "—"}</div>
            <div className="sm:col-span-2"><strong>Dirección:</strong> {row.direccion ?? "—"}</div>
          </div>

          <div className="border rounded-2 overflow-hidden">
            <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Clientes que usan este aval</div>
            {clientes.length === 0 ? (
              <div className="p-3 text-[13px] text-muted">No está asignado a ningún cliente.</div>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Nombre</th>
                    <th>INE</th>
                    <th>Teléfono</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map(c => (
                    <tr key={c.id}>
                      <td className="text-[13px]">{c.folio ?? "—"}</td>
                      <td className="text-[13px]">{c.nombre}</td>
                      <td className="text-[13px]">{c.ine ?? "—"}</td>
                      <td className="text-[13px]">{c.telefono ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------- Crear/Editar (Tabs Datos/Docs) -------- */
import { getPublicUrl } from "../lib/storage";
function UpsertAval({
  initial,
  onSaved,
  onClose
}: {
  initial?: Partial<Aval>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"datos" | "docs">("datos");
  const [form, setForm] = useState<Partial<Aval>>({
    nombre: initial?.nombre ?? "",
    ine: initial?.ine ?? "",
    telefono: initial?.telefono ?? "",
    direccion: initial?.direccion ?? "",
    estado: initial?.estado ?? "ACTIVO",
  });
  const [id, setId] = useState<number | null>(initial?.id ?? null);
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [pct, setPct] = useState<number | null>(null);

  const [confirm, ConfirmUI] = useConfirm();
  const [toast, ToastUI] = useToast();

  useEffect(() => { if (id) loadDocs(id); }, [id]);

  async function loadDocs(avalId: number) {
    const { data, error } = await supabase
      .from("docs_personas")
      .select("*")
      .eq("persona_tipo", "AVAL")
      .eq("persona_id", avalId)
      .order("created_at", { ascending: false });
    if (!error) setDocs((data || []) as any);
  }

  async function saveDatos() {
    if (!form.nombre?.trim()) { toast("El nombre es obligatorio.", "Atención"); return; }
    setSaving(true);
    try {
      if (id) {
        const { error } = await supabase.from("avales").update({
          nombre: form.nombre,
          ine: form.ine || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          estado: form.estado,
        }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("avales").insert({
          nombre: form.nombre,
          ine: form.ine || null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          estado: form.estado,
        }).select("id").single();
        if (error) throw error;
        setId(data!.id as number);
      }
      toast("Guardado.");
    } catch {
      toast("No se pudo guardar.", "Error");
    } finally { setSaving(false); }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.type !== "application/pdf") { toast("Sólo PDF.", "Atención"); return; }
    setFile(f);
    setDocName(f.name.replace(/\.pdf$/i, ""));
  }

  async function uploadDoc() {
    if (!id || !file) return;
    const clean = (docName || "documento").trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const final = `${clean}.pdf`;
    const path = `Personas/AVAL/${id}/${final}`;
    try {
      setSaving(true); setPct(10);
      const { error } = await supabase.storage.from("Personas").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      const url = getPublicUrl(path);
      setPct(90);
      await supabase.from("docs_personas").insert({
        persona_tipo: "AVAL", persona_id: id, tipo_doc: "OTRO", url, mime_type: "application/pdf", size_bytes: file.size
      });
      setPct(100);
      await loadDocs(id);
      setTimeout(() => { setFile(null); setDocName(""); setPct(null); }, 300);
      toast("Documento subido.");
    } catch {
      toast("No se pudo subir.", "Error");
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
    } catch { /* ignore */ }
    await supabase.from("docs_personas").delete().eq("id", d.id);
    if (id) loadDocs(id);
    toast("Documento eliminado.");
  }

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      {ConfirmUI}{ToastUI}
      <div className="w/[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab === "datos" ? "nav-active" : ""}`} onClick={() => setTab("datos")}>
              Datos
            </button>
            <button
              className={`btn-ghost !h-8 !px-3 text-xs ${tab === "docs" ? "nav-active" : ""}`}
              onClick={() => id && setTab("docs")}
              disabled={!id}
              title={!id ? "Guarda los datos primero" : ""}
            >
              Documentos
            </button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => { onSaved(); onClose(); }}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {tab === "datos" && (
          <>
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              <Field label="Nombre">
                <input className="input" value={form.nombre as string} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </Field>
              <Field label="INE">
                <input className="input" value={form.ine as string} onChange={(e) => setForm(f => ({ ...f, ine: e.target.value }))} />
              </Field>
              <Field label="Teléfono">
                <input className="input" value={form.telefono as string} onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Dirección">
                  <input className="input" value={form.direccion as string} onChange={(e) => setForm(f => ({ ...f, direccion: e.target.value }))} />
                </Field>
              </div>
              <Field label="Estado">
                <select className="input" value={form.estado as string} onChange={(e) => setForm(f => ({ ...f, estado: e.target.value as any }))}>
                  <option>ACTIVO</option>
                  <option>INACTIVO</option>
                </select>
              </Field>
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => { onSaved(); onClose(); }}>Cancelar</button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={saveDatos} disabled={saving}>
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          </>
        )}

        {tab === "docs" && id && (
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
                Subir
              </button>
            </div>
            {pct !== null && (
              <div className="w-full h-2 bg-gray-100 rounded">
                <div className="h-2 bg-[var(--baci-blue)]" style={{ width: `${pct}%` }} />
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
                        <button className="btn-ghost !h-8 !px-2 text-xs text-red-700" onClick={() => delDoc(d)}>
                          Eliminar
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
