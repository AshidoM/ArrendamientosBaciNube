// src/pages/Poblaciones.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Eye, Edit3, MoreVertical, ChevronLeft, ChevronRight,
  UserRound, Users, Power, Trash2, X, Save
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/Confirm";

/* ===========================
   Tipos
=========================== */
type Poblacion = {
  id: number;
  folio: string | null;
  nombre: string;
  municipio: string;
  estado_mx: string;
  estado: "ACTIVO" | "INACTIVO";
  coordinadora_id?: number | null;
  ruta_id?: number | null;              // << NUEVO: requerido por NOT NULL en BD
};

type Ruta = { id: number; nombre: string };

type Cliente = { id: number; folio?: string | null; nombre: string; poblacion_id?: number | null };
type Coordinadora = { id: number; folio?: string | null; nombre: string; poblacion_id?: number | null };

/* ===========================
   Menú flotante (portal)
=========================== */
type PortalMenuState = {
  open: boolean;
  x: number;
  y: number;
  row?: Poblacion;
};

function PortalMenu({
  state, onClose, onAssignClients, onAssignCoords, onToggle, onDelete, onView, onEdit
}: {
  state: PortalMenuState;
  onClose: () => void;
  onAssignClients: (p: Poblacion) => void;
  onAssignCoords: (p: Poblacion) => void;
  onToggle: (p: Poblacion) => void;
  onDelete: (p: Poblacion) => void;
  onView: (p: Poblacion) => void;
  onEdit: (p: Poblacion) => void;
}) {
  if (!state.open || !state.row) return null;
  const r = state.row;
  const body = (
    <div
      className="portal-menu"
      style={{ left: state.x, top: state.y }}
      onClick={(e)=>e.stopPropagation()}
    >
      <button className="portal-menu__item" onClick={() => { onView(r); onClose(); }}>
        <Eye className="w-4 h-4" /> Ver
      </button>
      <button className="portal-menu__item" onClick={() => { onEdit(r); onClose(); }}>
        <Edit3 className="w-4 h-4" /> Editar
      </button>
      <button className="portal-menu__item" onClick={() => { onAssignClients(r); onClose(); }}>
        <UserRound className="w-4 h-4" /> Asignar clientes
      </button>
      <button className="portal-menu__item" onClick={() => { onAssignCoords(r); onClose(); }}>
        <Users className="w-4 h-4" /> Asignar coordinadoras
      </button>
      <button className="portal-menu__item" onClick={() => { onToggle(r); onClose(); }}>
        <Power className="w-4 h-4" /> {r.estado === "ACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO"}
      </button>
      <button className="portal-menu__item portal-menu__item--danger" onClick={() => { onDelete(r); onClose(); }}>
        <Trash2 className="w-4 h-4" /> Eliminar
      </button>
    </div>
  );
  return createPortal(body, document.body);
}

/* ===========================
   Paginador (modales)
=========================== */
function Paginator({ page, setPage, totalPages }: { page: number; setPage: (n:number)=>void; totalPages: number; }) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn-outline btn--sm" onClick={()=>setPage(Math.max(1, page-1))} disabled={page<=1}>
        <ChevronLeft className="w-4 h-4" /> Anterior
      </button>
      <span className="text-[12px]">Página</span>
      <input
        className="input input--sm !w-16 text-center"
        value={page}
        onChange={(e)=> {
          const v = parseInt(e.target.value || "1", 10);
          if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), totalPages));
        }}
      />
      <span className="text-[12px]">de {totalPages}</span>
      <button className="btn-outline btn--sm" onClick={()=>setPage(Math.min(totalPages, page+1))} disabled={page>=totalPages}>
        Siguiente <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ===========================
   Modales de asignación
=========================== */
function AssignClientsModal({ poblacion, onClose }: { poblacion: Poblacion; onClose: () => void }) {
  const [confirm, ConfirmUI] = useConfirm();
  const [tab, setTab] = useState<"sel"|"asig">("sel");

  // seleccionar
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE = 4;

  // asignadas
  const [asigRows, setAsigRows] = useState<Cliente[]>([]);
  const [asigTotal, setAsigTotal] = useState(0);
  const [asigPage, setAsigPage] = useState(1);
  const ASIG_PAGE = 4;

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const asigPages = Math.max(1, Math.ceil(asigTotal / ASIG_PAGE));

  async function loadSel() {
    if (!q.trim()) { setRows([]); setTotal(0); return; }
    const { data, error, count } = await supabase
      .from("clientes")
      .select("id, folio, nombre, poblacion_id", { count: "exact" })
      .ilike("nombre", `%${q}%`)
      .order("id", { ascending: false })
      .range((page - 1) * PAGE, page * PAGE - 1);
    if (!error) { setRows((data || []) as Cliente[]); setTotal(count || 0); }
  }
  async function loadAsig() {
    const { data, error, count } = await supabase
      .from("clientes")
      .select("id, folio, nombre, poblacion_id", { count: "exact" })
      .eq("poblacion_id", poblacion.id)
      .order("id", { ascending: false })
      .range((asigPage - 1) * ASIG_PAGE, asigPage * ASIG_PAGE - 1);
    if (!error) { setAsigRows((data || []) as Cliente[]); setAsigTotal(count || 0); }
  }
  useEffect(()=>{ setPage(1); }, [q]);
  useEffect(()=>{ if (tab==="sel") loadSel(); /* eslint-disable-next-line */ }, [tab, q, page]);
  useEffect(()=>{ if (tab==="asig") loadAsig(); /* eslint-disable-next-line */ }, [tab, asigPage]);

  async function add(cli: Cliente) {
    const ok = await confirm({
      title: "Asignar cliente",
      message: <>¿Asignar <b>{cli.nombre}</b> a <b>{poblacion.nombre}</b>?</>,
      confirmText: "Asignar",
    });
    if (!ok) return;
    const { error } = await supabase.from("clientes").update({ poblacion_id: poblacion.id }).eq("id", cli.id);
    if (!error) { setTab("asig"); loadAsig(); }
  }
  async function remove(cli: Cliente) {
    const ok = await confirm({
      title: "Quitar cliente",
      message: <>¿Quitar <b>{cli.nombre}</b> de <b>{poblacion.nombre}</b>?</>,
      confirmText: "Quitar",
      tone: "warn",
    });
    if (!ok) return;
    const { error } = await supabase.from("clientes").update({ poblacion_id: null }).eq("id", cli.id);
    if (!error) loadAsig();
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      {ConfirmUI}
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="sel"?"nav-active":""}`} onClick={()=>setTab("sel")}>Seleccionar</button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="asig"?"nav-active":""}`} onClick={()=>setTab("asig")}>Asignados</button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cerrar</button>
        </div>

        <div className="p-3 grid gap-3">
          {tab==="sel" ? (
            <>
              <input className="input" placeholder="Buscar cliente…" value={q} onChange={(e)=>setQ(e.target.value)} />
              <div className="table-frame">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-center">Nombre</th>
                      <th className="text-center">Folio</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length===0 ? (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px] text-muted">Escribe para buscar.</td></tr>
                    ) : rows.map(c => (
                      <tr key={c.id}>
                        <td className="text-[13px] text-center">{c.nombre}</td>
                        <td className="text-[13px] text-center">{c.folio ?? "—"}</td>
                        <td>
                          <div className="flex justify-center">
                            <button className="btn-primary btn--sm" onClick={()=>add(c)}>Añadir</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-1 py-2 flex items-center justify-between">
                <div className="text-[12px] text-muted">{total===0?"0":`${(page-1)*PAGE+1}–${Math.min(page*PAGE,total)}`} de {total}</div>
                <Paginator page={page} setPage={setPage} totalPages={pages} />
              </div>
            </>
          ) : (
            <>
              <div className="table-frame">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-center">Nombre</th>
                      <th className="text-center">Folio</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asigRows.length===0 ? (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px] text-muted">Sin clientes asignados.</td></tr>
                    ) : asigRows.map(c => (
                      <tr key={c.id}>
                        <td className="text-[13px] text-center">{c.nombre}</td>
                        <td className="text-[13px] text-center">{c.folio ?? "—"}</td>
                        <td>
                          <div className="flex justify-center">
                            <button className="btn-outline btn--sm" onClick={()=>remove(c)}>Quitar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-1 py-2 flex items-center justify-between">
                <div className="text-[12px] text-muted">{asigTotal===0?"0":`${(asigPage-1)*ASIG_PAGE+1}–${Math.min(asigPage*ASIG_PAGE,asigTotal)}`} de {asigTotal}</div>
                <Paginator page={asigPage} setPage={setAsigPage} totalPages={asigPages} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AssignCoordinadorasModal({ poblacion, onClose }: { poblacion: Poblacion; onClose: () => void }) {
  const [confirm, ConfirmUI] = useConfirm();
  const [tab, setTab] = useState<"sel"|"asig">("sel");

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Coordinadora[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE = 4;

  const [asigRows, setAsigRows] = useState<Coordinadora[]>([]);
  const [asigTotal, setAsigTotal] = useState(0);
  const [asigPage, setAsigPage] = useState(1);
  const ASIG_PAGE = 4;

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const asigPages = Math.max(1, Math.ceil(asigTotal / ASIG_PAGE));

  async function loadSel() {
    if (!q.trim()) { setRows([]); setTotal(0); return; }
    const { data, error, count } = await supabase
      .from("coordinadoras")
      .select("id, folio, nombre, poblacion_id", { count: "exact" })
      .ilike("nombre", `%${q}%`)
      .order("id", { ascending: false })
      .range((page - 1) * PAGE, page * PAGE - 1);
    if (!error) { setRows((data || []) as Coordinadora[]); setTotal(count || 0); }
  }
  async function loadAsig() {
    const { data, error, count } = await supabase
      .from("coordinadoras")
      .select("id, folio, nombre, poblacion_id", { count: "exact" })
      .eq("poblacion_id", poblacion.id)
      .order("id", { ascending: false })
      .range((asigPage - 1) * ASIG_PAGE, asigPage * ASIG_PAGE - 1);
    if (!error) { setAsigRows((data || []) as Coordinadora[]); setAsigTotal(count || 0); }
  }
  useEffect(()=>{ setPage(1); }, [q]);
  useEffect(()=>{ if (tab==="sel") loadSel(); /* eslint-disable-next-line */ }, [tab, q, page]);
  useEffect(()=>{ if (tab==="asig") loadAsig(); /* eslint-disable-next-line */ }, [tab, asigPage]);

  async function add(c: Coordinadora) {
    const ok = await confirm({
      title: "Asignar coordinadora",
      message: <>¿Asignar <b>{c.nombre}</b> a <b>{poblacion.nombre}</b>?</>,
      confirmText: "Asignar",
    });
    if (!ok) return;
    const { error } = await supabase.from("coordinadoras").update({ poblacion_id: poblacion.id }).eq("id", c.id);
    if (!error) { setTab("asig"); loadAsig(); }
  }
  async function remove(c: Coordinadora) {
    const ok = await confirm({
      title: "Quitar coordinadora",
      message: <>¿Quitar <b>{c.nombre}</b> de <b>{poblacion.nombre}</b>?</>,
      confirmText: "Quitar",
      tone: "warn",
    });
    if (!ok) return;
    const { error } = await supabase.from("coordinadoras").update({ poblacion_id: null }).eq("id", c.id);
    if (!error) loadAsig();
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      {ConfirmUI}
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="sel"?"nav-active":""}`} onClick={()=>setTab("sel")}>Seleccionar</button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="asig"?"nav-active":""}`} onClick={()=>setTab("asig")}>Asignadas</button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cerrar</button>
        </div>

        <div className="p-3 grid gap-3">
          {tab==="sel" ? (
            <>
              <input className="input" placeholder="Buscar coordinadora…" value={q} onChange={(e)=>setQ(e.target.value)} />
              <div className="table-frame">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-center">Nombre</th>
                      <th className="text-center">Folio</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length===0 ? (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px] text-muted">Escribe para buscar.</td></tr>
                    ) : rows.map(c => (
                      <tr key={c.id}>
                        <td className="text-[13px] text-center">{c.nombre}</td>
                        <td className="text-[13px] text-center">{c.folio ?? "—"}</td>
                        <td>
                          <div className="flex justify-center">
                            <button className="btn-primary btn--sm" onClick={()=>add(c)}>Añadir</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-1 py-2 flex items-center justify-between">
                <div className="text-[12px] text-muted">{total===0?"0":`${(page-1)*PAGE+1}–${Math.min(page*PAGE,total)}`} de {total}</div>
                <Paginator page={page} setPage={setPage} totalPages={pages} />
              </div>
            </>
          ) : (
            <>
              <div className="table-frame">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-center">Nombre</th>
                      <th className="text-center">Folio</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asigRows.length===0 ? (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-[13px] text-muted">Sin coordinadoras.</td></tr>
                    ) : asigRows.map(c => (
                      <tr key={c.id}>
                        <td className="text-[13px] text-center">{c.nombre}</td>
                        <td className="text-[13px] text-center">{c.folio ?? "—"}</td>
                        <td>
                          <div className="flex justify-center">
                            <button className="btn-outline btn--sm" onClick={()=>remove(c)}>Quitar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-1 py-2 flex items-center justify-between">
                <div className="text-[12px] text-muted">{asigTotal===0?"0":`${(asigPage-1)*ASIG_PAGE+1}–${Math.min(asigPage*ASIG_PAGE,asigTotal)}`} de {asigTotal}</div>
                <Paginator page={asigPage} setPage={setAsigPage} totalPages={asigPages} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Ver / Crear-Editar
=========================== */
function ViewPopulationModal({ row, onClose }: { row: Poblacion; onClose: () => void }) {
  const [tab, setTab] = useState<"datos"|"clientes"|"coords">("datos");

  // comunes
  const PAGE = 4;

  // clientes
  const [qCli, setQCli] = useState("");
  const [cliRows, setCliRows] = useState<Cliente[]>([]);
  const [cliTotal, setCliTotal] = useState(0);
  const [cliPage, setCliPage] = useState(1);

  // coordinadoras
  const [qCrd, setQCrd] = useState("");
  const [crdRows, setCrdRows] = useState<Coordinadora[]>([]);
  const [crdTotal, setCrdTotal] = useState(0);
  const [crdPage, setCrdPage] = useState(1);

  const cliPages = Math.max(1, Math.ceil(cliTotal / PAGE));
  const crdPages = Math.max(1, Math.ceil(crdTotal / PAGE));

  async function loadClientes() {
    let q = supabase
      .from("clientes")
      .select("id, folio, nombre", { count: "exact" })
      .eq("poblacion_id", row.id)
      .order("id", { ascending: false });
    if (qCli.trim()) q = q.ilike("nombre", `%${qCli.trim()}%`);
    const { data, error, count } = await q.range((cliPage-1)*PAGE, cliPage*PAGE-1);
    if (!error) { setCliRows((data||[]) as Cliente[]); setCliTotal(count||0); }
  }
  async function loadCoords() {
    let q = supabase
      .from("coordinadoras")
      .select("id, folio, nombre", { count: "exact" })
      .eq("poblacion_id", row.id)
      .order("id", { ascending: false });
    if (qCrd.trim()) q = q.ilike("nombre", `%${qCrd.trim()}%`);
    const { data, error, count } = await q.range((crdPage-1)*PAGE, crdPage*PAGE-1);
    if (!error) { setCrdRows((data||[]) as Coordinadora[]); setCrdTotal(count||0); }
  }

  useEffect(()=>{ if (tab==="clientes") loadClientes(); /* eslint-disable-next-line */ }, [tab, qCli, cliPage]);
  useEffect(()=>{ if (tab==="coords") loadCoords(); /* eslint-disable-next-line */ }, [tab, qCrd, crdPage]);

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="datos"?"nav-active":""}`} onClick={()=>setTab("datos")}>Datos</button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="clientes"?"nav-active":""}`} onClick={()=>setTab("clientes")}>Clientes</button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="coords"?"nav-active":""}`} onClick={()=>setTab("coords")}>Coordinadoras</button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        {tab==="datos" ? (
          <div className="p-4 grid gap-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] px-2 py-1 rounded bg-gray-100 border">{row.folio ?? "—"}</span>
              <span className={`text-[12px] px-2 py-1 rounded border ${row.estado === "ACTIVO" ? "bg-blue-50 text-[var(--baci-blue)] border-[var(--baci-blue)]/40" : "bg-gray-100 text-gray-600"}`}>
                {row.estado}
              </span>
            </div>
            <div><strong>Nombre:</strong> {row.nombre}</div>
            <div><strong>Municipio:</strong> {row.municipio}</div>
            <div><strong>Estado (MX):</strong> {row.estado_mx}</div>
          </div>
        ) : tab==="clientes" ? (
          <div className="p-3 grid gap-3">
            <input className="input" placeholder="Buscar cliente…" value={qCli} onChange={(e)=>{ setCliPage(1); setQCli(e.target.value); }} />
            <div className="table-frame">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-center">Nombre</th>
                    <th className="text-center">Folio</th>
                  </tr>
                </thead>
                <tbody>
                  {cliRows.length===0 ? (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-[13px] text-muted">Sin clientes.</td></tr>
                  ) : cliRows.map(c => (
                    <tr key={c.id}>
                      <td className="text-[13px] text-center">{c.nombre}</td>
                      <td className="text-[13px] text-center">{c.folio ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-1 py-2 flex items-center justify-between">
              <div className="text-[12px] text-muted">{cliTotal===0?"0":`${(cliPage-1)*PAGE+1}–${Math.min(cliPage*PAGE,cliTotal)}`} de {cliTotal}</div>
              <Paginator page={cliPage} setPage={setCliPage} totalPages={cliPages} />
            </div>
          </div>
        ) : (
          <div className="p-3 grid gap-3">
            <input className="input" placeholder="Buscar coordinadora…" value={qCrd} onChange={(e)=>{ setCrdPage(1); setQCrd(e.target.value); }} />
            <div className="table-frame">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-center">Nombre</th>
                    <th className="text-center">Folio</th>
                  </tr>
                </thead>
                <tbody>
                  {crdRows.length===0 ? (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-[13px] text-muted">Sin coordinadoras.</td></tr>
                  ) : crdRows.map(c => (
                    <tr key={c.id}>
                      <td className="text-[13px] text-center">{c.nombre}</td>
                      <td className="text-[13px] text-center">{c.folio ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-1 py-2 flex items-center justify-between">
              <div className="text-[12px] text-muted">{crdTotal===0?"0":`${(crdPage-1)*PAGE+1}–${Math.min(crdPage*PAGE,crdTotal)}`} de {crdTotal}</div>
              <Paginator page={crdPage} setPage={setCrdPage} totalPages={crdPages} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===========================
   Crear/Editar (FORM)  >>> con RUTA obligatoria
=========================== */
function PopulationFormModal({
  initial, onSaved, onClose
}: {
  initial?: Partial<Poblacion>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Poblacion>>({
    nombre: initial?.nombre ?? "",
    municipio: initial?.municipio ?? "",
    estado_mx: initial?.estado_mx ?? "",
    estado: initial?.estado ?? "ACTIVO",
    ruta_id: initial?.ruta_id ?? undefined,   // << usa el valor si viene del registro
  });
  const [saving, setSaving] = useState(false);

  // Cargar rutas para el select
  const [rutas, setRutas] = useState<Ruta[]>([]);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("rutas")
        .select("id, nombre")
        .order("nombre", { ascending: true });
      if (!error) setRutas((data || []) as Ruta[]);
    })();
  }, []);

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre,
        municipio: form.municipio,
        estado_mx: form.estado_mx,
        estado: form.estado,
        ruta_id: form.ruta_id,                     // << SE ENVÍA (NOT NULL en BD)
      };

      if (initial?.id) {
        const { error } = await supabase.from("poblaciones").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("poblaciones").insert([payload]).select("id").single();
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="modal-card modal-card-md">
        <div className="modal-head">
          <div className="text-[13px] font-medium">{initial?.id ? "Editar población" : "Crear población"}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-3 text-[13px]">
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Nombre</div>
            <input className="input" value={form.nombre as string} onChange={(e)=>setForm(f=>({...f, nombre:e.target.value}))}/>
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Municipio</div>
            <input className="input" value={form.municipio as string} onChange={(e)=>setForm(f=>({...f, municipio:e.target.value}))}/>
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Estado (MX)</div>
            <input className="input" value={form.estado_mx as string} onChange={(e)=>setForm(f=>({...f, estado_mx:e.target.value}))}/>
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Estado</div>
            <select className="input" value={form.estado as string} onChange={(e)=>setForm(f=>({...f, estado:e.target.value as any}))}>
              <option>ACTIVO</option>
              <option>INACTIVO</option>
            </select>
          </label>

          {/* Campo RUTA obligatorio */}
          <label className="block sm:col-span-2">
            <div className="text-[12px] text-gray-600 mb-1">Ruta</div>
            <select
              className="input"
              value={form.ruta_id ?? ""}
              onChange={(e)=>setForm(f=>({...f, ruta_id: e.target.value ? Number(e.target.value) : undefined }))}
              required
            >
              <option value="">Selecciona una ruta…</option>
              {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </label>
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
          <button className="btn-primary !h-8 !px-3 text-xs whitespace-nowrap w-[170px]" onClick={submit} disabled={saving}>
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Página Poblaciones
=========================== */
export default function Poblaciones() {
  const [rows, setRows] = useState<Poblacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [search, setSearch] = useState("");

  // UI
  const [menu, setMenu] = useState<PortalMenuState>({ open:false, x:0, y:0 });
  const [assignCliFor, setAssignCliFor] = useState<Poblacion | null>(null);
  const [assignCrdFor, setAssignCrdFor] = useState<Poblacion | null>(null);
  const [viewRow, setViewRow] = useState<Poblacion | null>(null);
  const [editRow, setEditRow] = useState<Poblacion | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [confirm, ConfirmUI] = useConfirm();

  function openMenuFor(btn: HTMLButtonElement, row: Poblacion) {
    const r = btn.getBoundingClientRect();
    setMenu({
      open: true,
      x: Math.min(window.innerWidth - 240, r.right - 220),
      y: r.bottom + 6,
      row
    });
  }
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
    let q = supabase
      .from("poblaciones")
      .select("id, folio, nombre, municipio, estado_mx, estado, coordinadora_id, ruta_id", { count: "exact" })
      .order("id", { ascending: false });

    const s = search.trim();
    if (s) q = q.or(`nombre.ilike.%${s}%,municipio.ilike.%${s}%,estado_mx.ilike.%${s}%`);

    const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) { alert(error.message); return; }
    const rows = (data || []) as Poblacion[];
    setRows(rows);
    setTotal(count || 0);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, search]);

  // conteos por fila
  const [cliCounts, setCliCounts] = useState<Record<number, number>>({});
  const [crdCounts, setCrdCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    async function loadCounts() {
      if (rows.length === 0) { setCliCounts({}); setCrdCounts({}); return; }

      const ids = rows.map(r => r.id);
      // clientes
      const { data: clis } = await supabase
        .from("clientes")
        .select("id, poblacion_id")
        .in("poblacion_id", ids);
      const cMap: Record<number, number> = {};
      (clis || []).forEach((c:any)=>{ if (c.poblacion_id) cMap[c.poblacion_id] = (cMap[c.poblacion_id]||0)+1; });

      // coordinadoras (por poblacion_id + asignada directa en poblaciones.coordinadora_id)
      const { data: crds } = await supabase
        .from("coordinadoras")
        .select("id, poblacion_id")
        .in("poblacion_id", ids);
      const setMap: Record<number, Set<number>> = {};
      (crds || []).forEach((c:any)=> {
        if (!c.poblacion_id) return;
        if (!setMap[c.poblacion_id]) setMap[c.poblacion_id] = new Set();
        setMap[c.poblacion_id].add(c.id);
      });
      rows.forEach(r => {
        if (r.coordinadora_id) {
          if (!setMap[r.id]) setMap[r.id] = new Set();
          setMap[r.id].add(r.coordinadora_id);
        }
      });
      const dMap: Record<number, number> = {};
      Object.entries(setMap).forEach(([pid, set]) => dMap[+pid] = set.size);

      setCliCounts(cMap);
      setCrdCounts(dMap);
    }
    loadCounts();
  }, [rows]);

  async function toggleEstado(p: Poblacion) {
    const next = p.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const ok = await confirm({
      title: next === "INACTIVO" ? "Marcar como INACTIVO" : "Marcar como ACTIVO",
      message: <>¿Seguro que quieres marcar la población <b>{p.nombre}</b> como <b>{next}</b>?</>,
      confirmText: "Confirmar",
      tone: next === "INACTIVO" ? "warn" : "default",
    });
    if (!ok) return;
    const { error } = await supabase.from("poblaciones").update({ estado: next }).eq("id", p.id);
    if (!error) load();
  }
  async function remove(p: Poblacion) {
    const ok = await confirm({
      title: "Eliminar población",
      message: <>¿Eliminar <b>{p.nombre}</b>? Esta acción no se puede deshacer.</>,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("poblaciones").delete().eq("id", p.id);
    if (!error) load();
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
            className="input grow min-w-[280px]"
            placeholder="Buscar población…"
            value={search}
            onChange={(e)=>{ setPage(1); setSearch(e.target.value); }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted">Mostrar</span>
            <select className="input input--sm !w-20" value={pageSize} onChange={(e)=>{ setPage(1); setPageSize(parseInt(e.target.value)); }}>
              {[5,8,10,15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button
            className="btn-primary btn--sm ml-auto whitespace-nowrap w-[170px]"
            onClick={()=>setCreateOpen(true)}
          >
            <Plus className="w-4 h-4" /> Crear población
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
              <th className="text-center">Municipio</th>
              <th className="text-center">Estado (MX)</th>
              <th className="text-center">Estado</th>
              <th className="text-center"># Clientes</th>
              <th className="text-center"># Coordinadoras</th>
              <th className="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[13px] text-muted">Sin resultados.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px] text-center">{r.folio ?? "—"}</td>
                <td className="text-[13px] text-center">{r.nombre}</td>
                <td className="text-[13px] text-center">{r.municipio}</td>
                <td className="text-[13px] text-center">{r.estado_mx}</td>
                <td className="text-[13px] text-center">
                  {r.estado === "ACTIVO" ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span> : <span className="text-gray-500">INACTIVO</span>}
                </td>
                <td className="text-[13px] text-center">{cliCounts[r.id] ?? 0}</td>
                <td className="text-[13px] text-center">{crdCounts[r.id] ?? 0}</td>
                <td>
                  <div className="flex justify-center gap-2">
                    <button className="btn-outline btn--sm" onClick={()=>setViewRow(r)}>
                      <Eye className="w-4 h-4" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" onClick={()=>setEditRow(r)}>
                      <Edit3 className="w-4 h-4" /> Editar
                    </button>
                    <button className="btn-outline btn--sm" onClick={(e)=>{ openMenuFor(e.currentTarget, r); e.stopPropagation(); }}>
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer paginación */}
        <div className="px-3 py-2 border-t flex items-center justify-between">
          <div className="text-[12.5px] text-muted">{total === 0 ? "0" : `${from}–${to}`} de {total}</div>
          <Paginator page={page} setPage={setPage} totalPages={pages} />
        </div>
      </div>

      {/* Menú flotante */}
      <PortalMenu
        state={menu}
        onClose={()=>setMenu(s=>({ ...s, open:false }))}
        onAssignClients={(p)=>setAssignCliFor(p)}
        onAssignCoords={(p)=>setAssignCrdFor(p)}
        onToggle={toggleEstado}
        onDelete={remove}
        onView={(p)=>setViewRow(p)}
        onEdit={(p)=>setEditRow(p)}
      />

      {/* Modales */}
      {assignCliFor && <AssignClientsModal poblacion={assignCliFor} onClose={()=>setAssignCliFor(null)} />}
      {assignCrdFor && <AssignCoordinadorasModal poblacion={assignCrdFor} onClose={()=>setAssignCrdFor(null)} />}
      {viewRow && <ViewPopulationModal row={viewRow} onClose={()=>setViewRow(null)} />}
      {editRow && <PopulationFormModal initial={editRow} onSaved={load} onClose={()=>setEditRow(null)} />}
      {createOpen && <PopulationFormModal onSaved={load} onClose={()=>setCreateOpen(false)} />}
    </div>
  );
}
