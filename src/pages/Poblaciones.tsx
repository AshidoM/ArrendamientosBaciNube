import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Eye, Edit3, MoreVertical, ChevronLeft, ChevronRight,
  UserRound, Users, Power, Trash2, Search
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { getUser, type AppUser } from "../auth";

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
};

type Cliente = { id: number; folio?: string | null; nombre: string; poblacion_id?: number | null };
type Coordinadora = { id: number; folio?: string | null; nombre: string; poblacion_id?: number | null };

/* ===========================
   Menú flotante en Portal
=========================== */
type PortalMenuState = {
  open: boolean;
  x: number;
  y: number;
  row?: Poblacion;
};
function PortalMenu({
  state, onClose,
  onAssignClients, onAssignCoords, onToggle, onDelete
}: {
  state: PortalMenuState;
  onClose: () => void;
  onAssignClients: (p: Poblacion) => void;
  onAssignCoords: (p: Poblacion) => void;
  onToggle: (p: Poblacion) => void;
  onDelete: (p: Poblacion) => void;
}) {
  if (!state.open || !state.row) return null;
  const r = state.row;
  const body = (
    <div
      className="portal-menu"
      style={{ left: state.x, top: state.y }}
      onClick={(e)=>e.stopPropagation()}
    >
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
   Modales de selección (5 x página, buscar → confirmar)
=========================== */
function AssignClientsModal({
  poblacion, onClose
}: { poblacion: Poblacion; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  async function load() {
    // Si NO hay query: sólo lista los ya asignados a esta población
    if (!query.trim()) {
      const { data, error, count } = await supabase
        .from("clientes")
        .select("id, folio, nombre, poblacion_id", { count: "exact" })
        .eq("poblacion_id", poblacion.id)
        .order("id", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (!error) { setRows((data || []) as Cliente[]); setTotal(count || 0); }
      return;
    }
    // Con query: buscar por nombre (y no limitar a asignados)
    const { data, error, count } = await supabase
      .from("clientes")
      .select("id, folio, nombre, poblacion_id", { count: "exact" })
      .ilike("nombre", `%${query}%`)
      .order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (!error) { setRows((data || []) as Cliente[]); setTotal(count || 0); }
  }
  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [query, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function add(cli: Cliente) {
    if (!confirm(`¿Asignar cliente “${cli.nombre}” a ${poblacion.nombre}?`)) return;
    const { error } = await supabase.from("clientes").update({ poblacion_id: poblacion.id }).eq("id", cli.id);
    if (!error) load();
  }
  async function remove(cli: Cliente) {
    if (!confirm(`¿Quitar cliente “${cli.nombre}” de ${poblacion.nombre}?`)) return;
    const { error } = await supabase.from("clientes").update({ poblacion_id: null }).eq("id", cli.id);
    if (!error) load();
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Asignar clientes a <strong>{poblacion.nombre}</strong></div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cerrar</button>
        </div>

        <div className="p-3 grid gap-3">
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div className="relative">
              <input
                className="input"
                placeholder="Buscar cliente…"
                value={query}
                onChange={(e)=>setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="border rounded-2 overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-4 text-[13px] text-muted">Sin resultados.</div>
            ) : (
              <ul className="divide-y">
                {rows.map(c => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{c.nombre}</div>
                      <div className="text-[12px] text-muted">{c.folio ?? ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.poblacion_id === poblacion.id ? (
                        <button className="btn-outline btn--sm" onClick={()=>remove(c)}>Quitar</button>
                      ) : (
                        <button className="btn-primary btn--sm" onClick={()=>add(c)}>Añadir</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="px-3 py-2 border-t flex items-center justify-between">
              <div className="text-[12px] text-muted">
                {total === 0 ? "0" : `${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)}`} de {total}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-outline btn--sm" onClick={()=>setPage(Math.max(1, page-1))} disabled={page<=1}>
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <div className="text-[12px] text-muted">Página</div>
                <input
                  className="input input--sm !w-16 text-center"
                  value={page}
                  onChange={(e)=> {
                    const v = parseInt(e.target.value || "1", 10);
                    if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), totalPages));
                  }}
                />
                <div className="text-[12px] text-muted">de {totalPages}</div>
                <button className="btn-outline btn--sm" onClick={()=>setPage(Math.min(totalPages, page+1))} disabled={page>=totalPages}>
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignCoordinadorasModal({
  poblacion, onClose
}: { poblacion: Poblacion; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Coordinadora[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  async function load() {
    if (!query.trim()) {
      const { data, error, count } = await supabase
        .from("coordinadoras")
        .select("id, folio, nombre, poblacion_id", { count: "exact" })
        .eq("poblacion_id", poblacion.id)
        .order("id", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (!error) { setRows((data || []) as Coordinadora[]); setTotal(count || 0); }
      return;
    }
    const { data, error, count } = await supabase
      .from("coordinadoras")
      .select("id, folio, nombre, poblacion_id", { count: "exact" })
      .ilike("nombre", `%${query}%`)
      .order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (!error) { setRows((data || []) as Coordinadora[]); setTotal(count || 0); }
  }
  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [query, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function add(c: Coordinadora) {
    if (!confirm(`¿Asignar coordinadora “${c.nombre}” a ${poblacion.nombre}?`)) return;
    const { error } = await supabase.from("coordinadoras").update({ poblacion_id: poblacion.id }).eq("id", c.id);
    if (!error) load();
  }
  async function remove(c: Coordinadora) {
    if (!confirm(`¿Quitar coordinadora “${c.nombre}” de ${poblacion.nombre}?`)) return;
    const { error } = await supabase.from("coordinadoras").update({ poblacion_id: null }).eq("id", c.id);
    if (!error) load();
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Asignar coordinadoras a <strong>{poblacion.nombre}</strong></div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cerrar</button>
        </div>

        <div className="p-3 grid gap-3">
          <div className="relative">
            <input
              className="input"
              placeholder="Buscar coordinadora…"
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
            />
          </div>

          <div className="border rounded-2 overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-4 text-[13px] text-muted">Sin resultados.</div>
            ) : (
              <ul className="divide-y">
                {rows.map(c => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{c.nombre}</div>
                      <div className="text-[12px] text-muted">{c.folio ?? ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.poblacion_id === poblacion.id ? (
                        <button className="btn-outline btn--sm" onClick={()=>remove(c)}>Quitar</button>
                      ) : (
                        <button className="btn-primary btn--sm" onClick={()=>add(c)}>Añadir</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="px-3 py-2 border-t flex items-center justify-between">
              <div className="text-[12px] text-muted">
                {total === 0 ? "0" : `${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)}`} de {total}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-outline btn--sm" onClick={()=>setPage(Math.max(1, page-1))} disabled={page<=1}>
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <div className="text-[12px] text-muted">Página</div>
                <input
                  className="input input--sm !w-16 text-center"
                  value={page}
                  onChange={(e)=> {
                    const v = parseInt(e.target.value || "1", 10);
                    if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), totalPages));
                  }}
                />
                <div className="text-[12px] text-muted">de {totalPages}</div>
                <button className="btn-outline btn--sm" onClick={()=>setPage(Math.min(totalPages, page+1))} disabled={page>=totalPages}>
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Página Poblaciones
=========================== */
export default function Poblaciones() {
  const me = getUser() as AppUser | null;

  // tabla
  const [rows, setRows] = useState<Poblacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [search, setSearch] = useState("");

  // UI
  const [menu, setMenu] = useState<PortalMenuState>({ open:false, x:0, y:0 });
  const [assignCliFor, setAssignCliFor] = useState<Poblacion | null>(null);
  const [assignCrdFor, setAssignCrdFor] = useState<Poblacion | null>(null);

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
      .select("id, folio, nombre, municipio, estado_mx, estado", { count: "exact" })
      .order("id", { ascending: false });

    const s = search.trim();
    if (s) {
      q = q.or(`nombre.ilike.%${s}%,municipio.ilike.%${s}%,estado_mx.ilike.%${s}%`);
    }

    const { data, error, count } = await q
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (!error) {
      setRows((data || []) as Poblacion[]);
      setTotal(count || 0);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, search]);

  async function toggleEstado(p: Poblacion) {
    const next = p.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    if (!confirm(`¿Seguro que quieres marcar ${p.nombre} como ${next}?`)) return;
    const { error } = await supabase.from("poblaciones").update({ estado: next }).eq("id", p.id);
    if (!error) load();
  }
  async function remove(p: Poblacion) {
    if (!confirm(`¿Eliminar población ${p.nombre}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("poblaciones").delete().eq("id", p.id);
    if (!error) load();
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar población…"
            value={search}
            onChange={(e)=>{ setPage(1); setSearch(e.target.value); }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted">Mostrar</span>
            <select className="input input--sm" value={pageSize} onChange={(e)=>{ setPage(1); setPageSize(parseInt(e.target.value)); }}>
              {[5,8,10,15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary btn--sm"
              onClick={async ()=>{
                // modal simple de creación
                const nombre = prompt("Nombre de la población:");
                if (!nombre) return;
                const municipio = prompt("Municipio:") || "";
                const estado_mx = prompt("Estado (MX):") || "";
                const { error } = await supabase.from("poblaciones").insert({
                  nombre, municipio, estado_mx, estado: "ACTIVO"
                });
                if (!error) load();
              }}
            >
              <Plus className="w-4 h-4" /> Crear población
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
              <th>Municipio</th>
              <th>Estado (MX)</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-[13px] text-muted">Sin resultados.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px]">{r.folio ?? "—"}</td>
                <td className="text-[13px]">{r.nombre}</td>
                <td className="text-[13px]">{r.municipio}</td>
                <td className="text-[13px]">{r.estado_mx}</td>
                <td className="text-[13px]">
                  {r.estado === "ACTIVO"
                    ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span>
                    : <span className="text-gray-500">INACTIVO</span>}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-outline btn--sm" onClick={()=>alert(`Ver ${r.nombre}`)}>
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button className="btn-primary btn--sm" onClick={()=>alert(`Editar ${r.nombre}`)}>
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-outline btn--sm"
                      onClick={(e)=> {
                        const b = e.currentTarget.getBoundingClientRect();
                        setMenu({
                          open: true,
                          x: Math.min(window.innerWidth - 240, b.right - 220),
                          y: b.bottom + 6,
                          row: r
                        });
                        e.stopPropagation();
                      }}
                    >
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
          <div className="text-[12.5px] text-muted">
            {total === 0 ? "0" : `${from}–${to}`} de {total}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline btn--sm" onClick={()=>setPage(Math.max(1, page-1))} disabled={page<=1}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="text-[12.5px]">Página</div>
            <input
              className="input input--sm !w-16 text-center"
              value={page}
              onChange={(e)=> {
                const v = parseInt(e.target.value || "1", 10);
                if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), pages));
              }}
            />
            <div className="text-[12.5px]">de {pages}</div>
            <button className="btn-outline btn--sm" onClick={()=>setPage(Math.min(pages, page+1))} disabled={page>=pages}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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
      />

      {assignCliFor && <AssignClientsModal poblacion={assignCliFor} onClose={()=>setAssignCliFor(null)} />}
      {assignCrdFor && <AssignCoordinadorasModal poblacion={assignCrdFor} onClose={()=>setAssignCrdFor(null)} />}
    </div>
  );
}
