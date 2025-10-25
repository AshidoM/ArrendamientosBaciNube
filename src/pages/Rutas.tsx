// src/pages/Rutas.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Eye, Edit3, MapPinned, Power, Trash2,
  ChevronLeft, ChevronRight, X, Save, MoreVertical
} from "lucide-react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/Confirm";
import { getUser } from "../auth";

/* ===========================
   Tipos
=========================== */
type Ruta = {
  id: number;
  folio: string | null;
  nombre: string;
  estado: "ACTIVO" | "INACTIVO";
  descripcion?: string | null;
};

type Poblacion = {
  id: number;
  folio: string | null;
  nombre: string;
  municipio: string;
  estado_mx: string;
  ruta_id: number | null;
  coordinadora_id?: number | null;
};

/* ===========================
   Menú flotante (acciones extra) — solo ADMIN
=========================== */
function RowMenu({
  row, anchor, onClose, onAssign, onToggle, onDelete
}: {
  row: Ruta | null;
  anchor: DOMRect | null;
  onClose: () => void;
  onAssign: (r: Ruta)=>void;
  onToggle: (r: Ruta)=>void;
  onDelete: (r: Ruta)=>void;
}) {
  const [xy, setXY] = useState<{x:number;y:number}|null>(null);

  useEffect(() => {
    if (!anchor) return;
    setXY({
      x: Math.min(window.innerWidth - 240, anchor.right - 220),
      y: anchor.bottom + 6
    });
  }, [anchor]);

  useEffect(() => {
    const close = ()=>onClose();
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onEsc);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onEsc);
      window.removeEventListener("click", close);
    };
  }, [onClose]);

  if (!row || !xy) return null;
  const body = (
    <div className="portal-menu" style={{ left: xy.x, top: xy.y }} onClick={(e)=>e.stopPropagation()}>
      <button className="portal-menu__item" onClick={()=>{ onAssign(row); onClose(); }}>
        <MapPinned className="w-4 h-4" /> Asignar poblaciones
      </button>
      <button className="portal-menu__item" onClick={()=>{ onToggle(row); onClose(); }}>
        <Power className="w-4 h-4" /> {row.estado==="ACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO"}
      </button>
      <button className="portal-menu__item portal-menu__item--danger" onClick={()=>{ onDelete(row); onClose(); }}>
        <Trash2 className="w-4 h-4" /> Eliminar
      </button>
    </div>
  );
  return createPortal(body, document.body);
}

/* ===========================
   Modal: Asignar Poblaciones (ADMIN)
=========================== */
function AssignPopulationsToRouteModal({ ruta, onClose }: { ruta: Ruta; onClose: () => void }) {
  const [confirm, ConfirmUI] = useConfirm();
  const [tab, setTab] = useState<"buscar"|"asignadas">("buscar");

  // Buscar & seleccionar
  const [q, setQ] = useState("");
  const [resRows, setResRows] = useState<Poblacion[]>([]);
  const [resTotal, setResTotal] = useState(0);
  const [resPage, setResPage] = useState(1);
  const RES_PAGE = 4;

  const [picked, setPicked] = useState<Poblacion[]>([]);
  const [busyAdd, setBusyAdd] = useState(false);

  // Asignadas
  const [asigRows, setAsigRows] = useState<Poblacion[]>([]);
  const [asigTotal, setAsigTotal] = useState(0);
  const [asigPage, setAsigPage] = useState(1);
  const ASIG_PAGE = 4;
  const [busyDel, setBusyDel] = useState(false);

  const resPages = Math.max(1, Math.ceil(resTotal / RES_PAGE));
  const asigPages = Math.max(1, Math.ceil(asigTotal / ASIG_PAGE));

  async function loadResultados() {
    const term = q.trim();
    if (!term) { setResRows([]); setResTotal(0); return; }
    const { data, error, count } = await supabase
      .from("poblaciones")
      .select("id, folio, nombre, municipio, estado_mx, ruta_id, coordinadora_id", { count: "exact" })
      .or(`nombre.ilike.%${term}%,municipio.ilike.%${term}%,estado_mx.ilike.%${term}%`)
      .order("id", { ascending: false })
      .range((resPage - 1) * RES_PAGE, resPage * RES_PAGE - 1);
    if (error) return alert(error.message);
    setResRows((data || []) as Poblacion[]);
    setResTotal(count || 0);
  }
  useEffect(()=>{ setResPage(1); }, [q]);
  useEffect(()=>{ if (tab==="buscar") loadResultados(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [tab, q, resPage]);

  function togglePick(p: Poblacion) {
    setPicked(list => {
      const exists = list.some(x => x.id === p.id);
      return exists ? list.filter(x => x.id !== p.id) : [...list, p];
    });
  }
  function clearPicked() { setPicked([]); }

  async function applyPicked() {
    const ids = picked.filter(p => p.ruta_id !== ruta.id).map(p => p.id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: "Añadir seleccionadas",
      message: <>¿Asignar <b>{ids.length}</b> poblaciones a la ruta <b>{ruta.nombre}</b>?</>,
      confirmText: "Añadir",
    });
    if (!ok) return;
    setBusyAdd(true);
    try {
      const { error } = await supabase.from("poblaciones").update({ ruta_id: ruta.id }).in("id", ids);
      if (error) throw error;
      clearPicked();
      await loadResultados();
      await loadAsignadas();
      setTab("asignadas");
    } catch (e: any) {
      alert(e?.message ?? "No se pudo asignar.");
    } finally { setBusyAdd(false); }
  }

  async function loadAsignadas() {
    const { data, error, count } = await supabase
      .from("poblaciones")
      .select("id, folio, nombre, municipio, estado_mx, ruta_id, coordinadora_id", { count: "exact" })
      .eq("ruta_id", ruta.id)
      .order("id", { ascending: false })
      .range((asigPage - 1) * ASIG_PAGE, asigPage * ASIG_PAGE - 1);
    if (error) return alert(error.message);
    setAsigRows((data || []) as Poblacion[]);
    setAsigTotal(count || 0);
  }
  useEffect(()=>{ if (tab==="asignadas") loadAsignadas(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [tab, asigPage]);

  async function remove(p: Poblacion) {
    const ok = await confirm({
      title: "Quitar población",
      message: <>¿Quitar <b>{p.nombre}</b> de la ruta <b>{ruta.nombre}</b>?</>,
      confirmText: "Quitar",
      tone: "warn",
    });
    if (!ok) return;
    setBusyDel(true);
    try {
      const { error } = await supabase.from("poblaciones").update({ ruta_id: null }).eq("id", p.id);
      if (error) throw error;
      await loadAsignadas();
      setPicked(arr => arr.filter(x => x.id !== p.id));
    } catch (e: any) {
      alert(e?.message ?? "No se pudo quitar (revisa RLS/constraints).");
    } finally { setBusyDel(false); }
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      {ConfirmUI}
      <div className="w-[96vw] max-w-5xl bg-white rounded-2 border shadow-xl overflow-hidden">
        {/* Head */}
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="buscar" ? "nav-active" : ""}`} onClick={()=>setTab("buscar")}>
              Seleccionar
            </button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="asignadas" ? "nav-active" : ""}`} onClick={()=>setTab("asignadas")}>
              Asignadas
            </button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cerrar</button>
        </div>

        {/* Contenido */}
        <div className="p-3">
          {tab==="buscar" ? (
            <div className="grid gap-3">
              {/* Barra seleccionadas */}
              <div className="p-2 border rounded-2 bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px]">Seleccionadas: <b>{picked.length}</b></div>
                  <div className="flex items-center gap-2">
                    <button className="btn-outline btn--sm" onClick={clearPicked} disabled={picked.length===0}>Limpiar</button>
                    <button className="btn-primary btn--sm" onClick={applyPicked} disabled={picked.length===0 || busyAdd}>Añadir seleccionadas</button>
                  </div>
                </div>
              </div>

              {/* Buscar */}
              <input className="input" placeholder="Buscar por Nombre / Municipio / Estado…" value={q} onChange={(e)=>setQ(e.target.value)} />

              {/* Resultados */}
              {q.trim()==="" ? (
                <div className="p-4 text-[13px] text-muted">Escribe para buscar poblaciones.</div>
              ) : resRows.length===0 ? (
                <div className="p-4 text-[13px] text-muted">Sin resultados para “{q}”.</div>
              ) : (
                <div className="table-frame overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-center"></th>
                        <th className="text-center">Nombre</th>
                        <th className="text-center">Municipio</th>
                        <th className="text-center">Estado</th>
                        <th className="text-center">Situación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resRows.map(p => {
                        const checked = picked.some(x => x.id === p.id);
                        const disabled = p.ruta_id === ruta.id;
                        return (
                          <tr key={p.id} className={disabled ? "opacity-60" : ""}>
                            <td className="text-center">
                              <button
                                className="btn-ghost !h-7 !px-2 disabled:opacity-50"
                                onClick={()=>!disabled && togglePick(p)}
                                disabled={disabled}
                                title={disabled ? "Ya asignada a esta ruta" : (checked?"Quitar de seleccionadas":"Seleccionar")}
                              >
                                {checked ? "☑️" : "⬜"}
                              </button>
                            </td>
                            <td className="text-[13px] text-center">{p.nombre}</td>
                            <td className="text-[13px] text-center">{p.municipio}</td>
                            <td className="text-[13px] text-center">{p.estado_mx}</td>
                            <td className="text-[12px] text-center">{disabled ? "En esta ruta" : (checked ? "Seleccionada" : (p.ruta_id ? "En otra ruta" : "Libre"))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Paginación resultados */}
              <div className="px-1 py-2 flex items-center justify-between">
                <div className="text-[12px] text-muted">
                  {resTotal===0?"0":`${(resPage-1)*RES_PAGE+1}–${Math.min(resPage*RES_PAGE,resTotal)}`} de {resTotal}
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-outline btn--sm" onClick={()=>setResPage(p=>Math.max(1,p-1))} disabled={resPage<=1}>
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-[12px]">Página</span>
                  <input className="input input--sm !w-16 text-center" value={resPage}
                    onChange={(e)=>{ const v = parseInt(e.target.value||"1",10); if (!Number.isNaN(v)) setResPage(Math.min(Math.max(1,v),resPages)); }} />
                  <span className="text-[12px]">de {resPages}</span>
                  <button className="btn-outline btn--sm" onClick={()=>setResPage(p=>Math.min(resPages,p+1))} disabled={resPage>=resPages}>
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // TAB asignadas
            <div className="grid gap-3">
              <div className="table-frame overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-center">Nombre</th>
                      <th className="text-center">Municipio</th>
                      <th className="text-center">Estado</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asigRows.length===0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-muted">Sin poblaciones asignadas.</td></tr>
                    ) : asigRows.map(p => (
                      <tr key={p.id}>
                        <td className="text-[13px] text-center">{p.nombre}</td>
                        <td className="text-[13px] text-center">{p.municipio}</td>
                        <td className="text-[13px] text-center">{p.estado_mx}</td>
                        <td>
                          <div className="flex justify-center">
                            <button className="btn-outline btn--sm" onClick={()=>remove(p)} disabled={busyDel}>Quitar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación asignadas */}
              <div className="px-1 py-2 flex items-center justify-between">
                <div className="text-[12px] text-muted">
                  {asigTotal===0?"0":`${(asigPage-1)*ASIG_PAGE+1}–${Math.min(asigPage*ASIG_PAGE,asigTotal)}`} de {asigTotal}
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-outline btn--sm" onClick={()=>setAsigPage(p=>Math.max(1,p-1))} disabled={asigPage<=1}>
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-[12px]">Página</span>
                  <input className="input input--sm !w-16 text-center" value={asigPage}
                    onChange={(e)=>{ const v = parseInt(e.target.value||"1",10); if (!Number.isNaN(v)) setAsigPage(Math.min(Math.max(1,v),asigPages)); }} />
                  <span className="text-[12px]">de {asigPages}</span>
                  <button className="btn-outline btn--sm" onClick={()=>setAsigPage(p=>Math.min(asigPages,p+1))} disabled={asigPage>=asigPages}>
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Modales Ver / Editar-Crear
=========================== */
function ViewRouteModal({ row, onClose }: { row: Ruta; onClose: () => void }) {
  const [tab, setTab] = useState<"datos"|"pobs">("datos");

  // Poblaciones con búsqueda y 4x página
  const [q, setQ] = useState("");
  const [asigRows, setAsigRows] = useState<Poblacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE = 4;

  async function load() {
    let query = supabase
      .from("poblaciones")
      .select("id, folio, nombre, municipio, estado_mx", { count: "exact" })
      .eq("ruta_id", row.id)
      .order("id", { ascending: false });

    const s = q.trim();
    if (s) {
      query = query.or(`nombre.ilike.%${s}%,municipio.ilike.%${s}%,estado_mx.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .range((page - 1) * PAGE, page * PAGE - 1);

    if (!error) { setAsigRows((data || []) as Poblacion[]); setTotal(count || 0); }
  }
  useEffect(()=>{ if (tab==="pobs") load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [tab, page, q]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="datos"?"nav-active":""}`} onClick={()=>setTab("datos")}>Datos</button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="pobs"?"nav-active":""}`} onClick={()=>setTab("pobs")}>Poblaciones</button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {tab==="datos" ? (
          <div className="p-5 grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] px-2 py-1 rounded bg-gray-100 border">{row.folio ?? "—"}</span>
              <span className={`text-[12px] px-2 py-1 rounded border ${row.estado === "ACTIVO" ? "bg-blue-50 text-[var(--baci-blue)] border-[var(--baci-blue)]/40" : "bg-gray-100 text-gray-600"}`}>
                {row.estado}
              </span>
            </div>

            <div>
              <div className="text-[12px] text-gray-600 mb-1">Nombre</div>
              <div className="text-[13px] font-medium">{row.nombre}</div>
            </div>

            <div>
              <div className="text-[12px] text-gray-600 mb-1">Descripción</div>
              <div className="text-[13px] whitespace-pre-wrap">{row.descripcion || "—"}</div>
            </div>
          </div>
        ) : (
          <div className="p-3 grid gap-3">
            <input className="input" placeholder="Buscar población en esta ruta…" value={q} onChange={(e)=>{ setPage(1); setQ(e.target.value); }} />
            <div className="table-frame overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-center">Nombre</th>
                    <th className="text-center">Municipio</th>
                    <th className="text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {asigRows.length===0 ? (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px] text-muted">Sin poblaciones.</td></tr>
                  ) : asigRows.map(p => (
                    <tr key={p.id}>
                      <td className="text-[13px] text-center">{p.nombre}</td>
                      <td className="text-[13px] text-center">{p.municipio}</td>
                      <td className="text-[13px] text-center">{p.estado_mx}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-1 py-2 flex items-center justify-between">
              <div className="text-[12px] text-muted">
                {total===0?"0":`${(page-1)*PAGE+1}–${Math.min(page*PAGE,total)}`} de {total}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-outline btn--sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <span className="text-[12px]">Página</span>
                <input
                  className="input input--sm !w-16 text-center"
                  value={page}
                  onChange={(e)=> {
                    const v = parseInt(e.target.value||"1",10);
                    if (!Number.isNaN(v)) setPage(Math.min(Math.max(1,v),pages));
                  }}
                />
                <span className="text-[12px]">de {pages}</span>
                <button className="btn-outline btn--sm" onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page>=pages}>
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RouteFormModal({
  initial, onSaved, onClose,
}: { initial?: Partial<Ruta>; onSaved: () => void; onClose: () => void; }) {
  const me = getUser();
  const isCapturista = me?.rol === "CAPTURISTA";

  const [form, setForm] = useState<Partial<Ruta>>({
    nombre: initial?.nombre ?? "",
    descripcion: initial?.descripcion ?? "",
    estado: initial?.estado ?? "ACTIVO",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.nombre?.trim()) { alert("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      if (initial?.id) {
        const { error } = await supabase
          .from("rutas")
          .update({ nombre: form.nombre, descripcion: form.descripcion || null, estado: form.estado })
          .eq("id", initial.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("rutas")
          .insert({ nombre: form.nombre, descripcion: form.descripcion || null, estado: form.estado })
          .select("id")
          .single();
        if (error) throw error;

        // Auto-asignación si la crea una CAPTURISTA
        if (isCapturista && data?.id) {
          const { error: e2 } = await supabase
            .from("capturista_rutas")
            .upsert(
              { capturista_id: me.id, ruta_id: data.id, activo: true },
              { onConflict: "capturista_id,ruta_id", ignoreDuplicates: false }
            );
          if (e2) throw e2;
        }
      }
      onSaved();
      onClose();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo guardar.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="modal-card modal-card-md">
        <div className="modal-head">
          <div className="text-[13px] font-medium">{initial?.id ? "Editar ruta" : "Crear ruta"}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>
        <div className="p-4 grid gap-3 text-[13px]">
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Nombre</div>
            <input className="input" value={form.nombre as string} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Descripción</div>
            <textarea className="input" rows={3} value={form.descripcion as string} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Estado</div>
            <select className="input" value={form.estado as string} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as any }))}>
              <option>ACTIVO</option>
              <option>INACTIVO</option>
            </select>
          </label>
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
          <button className="btn-primary !h-8 !px-3 text-xs" onClick={submit} disabled={saving}>
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Página Rutas
=========================== */
export default function Rutas() {
  const me = getUser();
  const isAdmin = me?.rol === "ADMIN";
  const isCapturista = me?.rol === "CAPTURISTA";

  const [rows, setRows] = useState<Ruta[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5); // default 5
  const [search, setSearch] = useState("");

  // conteos por ruta
  const [pobCounts, setPobCounts] = useState<Record<number, number>>({});
  const [cliCounts, setCliCounts] = useState<Record<number, number>>({});
  const [coordCounts, setCoordCounts] = useState<Record<number, number>>({});

  // menús y modales
  const [menuRow, setMenuRow] = useState<Ruta | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);

  const [assignFor, setAssignFor] = useState<Ruta | null>(null);
  const [viewRow, setViewRow] = useState<Ruta | null>(null);
  const [editRow, setEditRow] = useState<Ruta | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [confirm, ConfirmUI] = useConfirm();

  useEffect(() => {
    const close = ()=>{ setMenuRow(null); setMenuRect(null); };
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
    // --- Filtro por rol
    let rutaIds: number[] | null = null;
    if (isCapturista) {
      const { data: rel, error: eRel } = await supabase
        .from("capturista_rutas")
        .select("ruta_id")
        .eq("capturista_id", me.id)
        .eq("activo", true);
      if (eRel) { alert(eRel.message); return; }
      rutaIds = (rel || []).map((r:any)=>r.ruta_id);
      if (rutaIds.length === 0) { setRows([]); setTotal(0); setPobCounts({}); setCliCounts({}); setCoordCounts({}); return; }
    }

    // 1) rutas página
    let q = supabase
      .from("rutas")
      .select("id, folio, nombre, estado, descripcion", { count: "exact" })
      .order("id", { ascending: false });

    const s = search.trim();
    if (s) q = q.ilike("nombre", `%${s}%`);
    if (rutaIds) q = q.in("id", rutaIds);

    const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) { alert(error.message); return; }
    const routes = (data || []) as Ruta[];
    setRows(routes);
    setTotal(count || 0);

    // 2) conteos por ruta usando poblaciones como pivote
    if (routes.length) {
      const ids = routes.map(r => r.id);

      // Pob de las rutas (incluye coordinadora)
      const { data: pobs, error: eP } = await supabase
        .from("poblaciones")
        .select("id, ruta_id, coordinadora_id")
        .in("ruta_id", ids);

      if (eP) { alert(eP.message); setPobCounts({}); setCliCounts({}); setCoordCounts({}); return; }

      const pobMap: Record<number, number> = {};
      const pobIdToRuta: Record<number, number> = {};
      const coordSets: Record<number, Set<number>> = {};
      (pobs || []).forEach((p: any) => {
        if (!p.ruta_id) return;
        pobMap[p.ruta_id] = (pobMap[p.ruta_id] || 0) + 1;
        pobIdToRuta[p.id] = p.ruta_id;
        if (p.coordinadora_id) {
          if (!coordSets[p.ruta_id]) coordSets[p.ruta_id] = new Set();
          coordSets[p.ruta_id].add(p.coordinadora_id);
        }
      });

      // Clientes por ruta
      const pobIds = Object.keys(pobIdToRuta).map(Number);
      let cliMap: Record<number, number> = {};
      if (pobIds.length) {
        const { data: clientes, error: eC } = await supabase
          .from("clientes")
          .select("id, poblacion_id")
          .in("poblacion_id", pobIds);
        if (eC) { alert(eC.message); }
        (clientes || []).forEach((c: any) => {
          const rid = pobIdToRuta[c.poblacion_id];
          if (rid) cliMap[rid] = (cliMap[rid] || 0) + 1;
        });
      }

      const coordMap: Record<number, number> = {};
      Object.entries(coordSets).forEach(([rid, set]) => { coordMap[+rid] = set.size; });

      setPobCounts(pobMap);
      setCliCounts(cliMap);
      setCoordCounts(coordMap);
    } else {
      setPobCounts({});
      setCliCounts({});
      setCoordCounts({});
    }
  }
  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page, pageSize, search]);

  async function toggleEstado(r: Ruta) {
    const next = r.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const ok = await confirm({
      title: next === "INACTIVO" ? "Marcar como INACTIVO" : "Marcar como ACTIVO",
      message: <>¿Seguro que quieres marcar la ruta <b>{r.nombre}</b> como <b>{next}</b>?</>,
      confirmText: "Confirmar",
      tone: next === "INACTIVO" ? "warn" : "default",
    });
    if (!ok) return;
    const { error } = await supabase.from("rutas").update({ estado: next }).eq("id", r.id);
    if (error) return alert(error.message);
    load();
  }

  async function removeRow(r: Ruta) {
    const ok = await confirm({
      title: "Eliminar ruta",
      message: <>¿Eliminar la ruta <b>{r.nombre}</b>? Esta acción no se puede deshacer.</>,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("rutas").delete().eq("id", r.id);
    if (error) return alert(error.message);
    load();
  }

  const pages = useMemo(()=>Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="dt__card">
      {ConfirmUI}

      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="flex items-center gap-3 w-full">
          <input
            className="input shrink-0 w-[360px] max-w-[50vw]"
            placeholder="Buscar ruta…"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted">Mostrar</span>
            <select
              className="input input--sm !w-20"
              value={pageSize}
              onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value)); }}
            >
              {[5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn-primary btn--sm ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Crear ruta
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-center">Folio</th>
              <th className="text-center">Nombre</th>
              <th className="text-center">Estado</th>
              <th className="text-center"># Poblaciones</th>
              <th className="text-center"># Clientes</th>
              <th className="text-center"># Coordinadoras</th>
              <th className="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[13px] text-muted">Sin resultados.</td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px] text-center">{r.folio ?? "—"}</td>
                <td className="text-[13px] text-center">{r.nombre}</td>
                <td className="text-[13px] text-center">
                  {r.estado === "ACTIVO"
                    ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span>
                    : <span className="text-gray-500">INACTIVO</span>}
                </td>
                <td className="text-[13px] text-center">{pobCounts[r.id] ?? 0}</td>
                <td className="text-[13px] text-center">{cliCounts[r.id] ?? 0}</td>
                <td className="text-[13px] text-center">{coordCounts[r.id] ?? 0}</td>
                <td>
                  <div className="flex items-center justify-center gap-2">
                    <button className="btn-outline btn--sm" title="Ver" onClick={() => setViewRow(r)}>
                      <Eye className="w-4 h-4" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" title="Editar" onClick={() => setEditRow(r)}>
                      <Edit3 className="w-4 h-4" /> Editar
                    </button>

                    {/* Botón 'más' solo para ADMIN */}
                    {isAdmin && (
                      <button
                        className="btn-outline btn--sm"
                        onClick={(e)=>{ setMenuRow(r); setMenuRect(e.currentTarget.getBoundingClientRect()); e.stopPropagation(); }}
                        title="Más acciones"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paginación */}
        <div className="px-3 py-2 border-t flex items-center justify-between">
          <div className="text-[12.5px] text-muted">
            {total === 0 ? "0" : `${from}–${to}`} de {total}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline btn--sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="text-[12.5px]">Página</div>
            <input
              className="input input--sm !w-16 text-center"
              value={page}
              onChange={(e) => {
                const v = parseInt(e.target.value || "1", 10);
                if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), pages));
              }}
            />
            <div className="text-[12.5px]">de {pages}</div>
            <button className="btn-outline btn--sm" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Menú flotante (solo ADMIN) */}
      {isAdmin && (
        <RowMenu
          row={menuRow}
          anchor={menuRect}
          onClose={()=>{ setMenuRow(null); setMenuRect(null); }}
          onAssign={(r)=>setAssignFor(r)}
          onToggle={toggleEstado}
          onDelete={removeRow}
        />
      )}

      {/* Modales */}
      {assignFor && <AssignPopulationsToRouteModal ruta={assignFor} onClose={() => setAssignFor(null)} />}
      {viewRow && <ViewRouteModal row={viewRow} onClose={() => setViewRow(null)} />}
      {editRow && <RouteFormModal initial={editRow} onSaved={load} onClose={() => setEditRow(null)} />}
      {createOpen && <RouteFormModal onSaved={load} onClose={() => setCreateOpen(false)} />}

      {/* Confirm UI */}
      {ConfirmUI}
    </div>
  );
}
