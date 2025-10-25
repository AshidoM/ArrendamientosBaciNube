// src/pages/Usuarios.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  Edit3,
  MoreVertical,
  KeyRound,
  MapPin,
  Trash2,
  Power,
  FileStack,
  Route as RouteIcon,
  Save,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { getUser } from "../auth";
import useConfirm from "../components/Confirm";

import AssignPopulationsModal from "../components/AssignPopulationsModal";
import AssignRoutesModal from "../components/AssignRoutesModal";
import UserDocumentsModal from "../components/UserDocumentsModal";

/* ===== Tipos ===== */
export type UserRow = {
  id: string;
  username: string;
  nombre_completo: string | null;
  rol: "ADMIN" | "CAPTURISTA";
  estado: "ACTIVO" | "INACTIVO";
  correo: string | null;
  telefono: string | null;
  ine: string | null;
};

/* ===== Menú en portal (condicionado por ROL DEL USUARIO LISTADO) ===== */
type PortalMenuState = { open: boolean; x: number; y: number; row?: UserRow };
function PortalMenu({
  state,
  onClose,
  onPassword,
  onAssignPobs,
  onAssignRoutes,
  onToggle,
  onDocs,
  onDelete,
}: {
  state: PortalMenuState;
  onClose: () => void;
  onPassword: (u: UserRow) => void;
  onAssignPobs: (u: UserRow) => void;
  onAssignRoutes: (u: UserRow) => void;
  onToggle: (u: UserRow) => void;
  onDocs: (u: UserRow) => void;
  onDelete: (u: UserRow) => void;
}) {
  useEffect(() => {
    if (!state.open) return;
    const close = () => onClose();
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
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
  }, [state.open, onClose]);

  if (!state.open || !state.row) return null;
  const u = state.row;
  const isCapturista = u.rol === "CAPTURISTA"; // <- solo CAPTURISTA muestra “Asignar …”

  const body = (
    <div
      className="portal-menu"
      style={{ left: state.x, top: state.y, zIndex: 10020 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="portal-menu__item" onClick={() => onPassword(u)}>
        <KeyRound className="w-4 h-4" /> Actualizar contraseña
      </button>

      {isCapturista && (
        <button className="portal-menu__item" onClick={() => onAssignRoutes(u)}>
          <RouteIcon className="w-4 h-4" /> Asignar rutas
        </button>
      )}

      {isCapturista && (
        <button className="portal-menu__item" onClick={() => onAssignPobs(u)}>
          <MapPin className="w-4 h-4" /> Asignar poblaciones
        </button>
      )}

      <button className="portal-menu__item" onClick={() => onDocs(u)}>
        <FileStack className="w-4 h-4" /> Docs
      </button>

      <button className="portal-menu__item" onClick={() => onToggle(u)}>
        <Power className="w-4 h-4" /> {u.estado === "ACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO"}
      </button>

      <button className="portal-menu__item portal-menu__item--danger" onClick={() => onDelete(u)}>
        <Trash2 className="w-4 h-4" /> Eliminar
      </button>
    </div>
  );

  return createPortal(body, document.body);
}

/* ===== Modales simples Ver/Editar/Crear/Password ===== */

function ViewUserModal({ row, onClose }: { row: UserRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50" onClick={onClose}>
      <div className="modal-card modal-card-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="text-[13px] font-medium">Usuario @{row.username}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>
        <div className="p-4 grid gap-2 text-[13px]">
          <div><strong>Nombre:</strong> {row.nombre_completo ?? "—"}</div>
          <div><strong>Rol:</strong> {row.rol}</div>
          <div><strong>Estado:</strong> {row.estado}</div>
          <div><strong>INE:</strong> {row.ine ?? "—"}</div>
          <div><strong>Correo:</strong> {row.correo ?? "—"}</div>
          <div><strong>Teléfono:</strong> {row.telefono ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({
  initial,
  onSaved,
  onClose,
}: {
  initial?: Partial<UserRow>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [confirm, ConfirmUI] = useConfirm();

  const [form, setForm] = useState<Partial<UserRow>>({
    username: initial?.username ?? "",
    nombre_completo: initial?.nombre_completo ?? "",
    rol: initial?.rol ?? "CAPTURISTA",
    estado: initial?.estado ?? "ACTIVO",
    correo: initial?.correo ?? "",
    telefono: initial?.telefono ?? "",
    ine: initial?.ine ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    const ok = await confirm({
      title: initial?.id ? "Actualizar usuario" : "Crear usuario",
      message: initial?.id
        ? `¿Guardar cambios para @${initial.username}?`
        : `¿Crear nuevo usuario @${form.username}?`,
      confirmText: "Guardar",
    });
    if (!ok) return;

    setSaving(true);
    try {
      if (initial?.id) {
        const { error } = await supabase
          .from("users_local")
          .update({
            username: form.username,
            nombre_completo: form.nombre_completo,
            rol: form.rol,
            estado: form.estado,
            correo: form.correo,
            telefono: form.telefono,
            ine: form.ine,
          })
          .eq("id", initial.id as string);
        if (error) throw error;
        await confirm({ title: "Actualizado", message: "El usuario se actualizó correctamente." });
      } else {
        const { error } = await supabase.from("users_local").insert({
          username: form.username,
          nombre_completo: form.nombre_completo,
          rol: form.rol,
          estado: form.estado,
          correo: form.correo,
          telefono: form.telefono,
          ine: form.ine,
          password: "123456",
        });
        if (error) throw error;
        await confirm({ title: "Creado", message: "El usuario fue creado correctamente." });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      console.error(e);
      await confirm({
        tone: "danger",
        title: "Error",
        message: e?.message || "No se pudo guardar el usuario.",
        confirmText: "Entendido",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50" onClick={onClose}>
      {ConfirmUI}
      <div className="modal-card modal-card-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="text-[13px] font-medium">
            {initial?.id ? "Editar usuario" : "Crear usuario"}
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-3 text-[13px]">
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Usuario</div>
            <input
              className="input"
              value={form.username as string}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Nombre completo</div>
            <input
              className="input"
              value={form.nombre_completo as string}
              onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))}
            />
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Rol</div>
            <select
              className="input"
              value={form.rol as string}
              onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as any }))}
            >
              <option>ADMIN</option>
              <option>CAPTURISTA</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Estado</div>
            <select
              className="input"
              value={form.estado as string}
              onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as any }))}
            >
              <option>ACTIVO</option>
              <option>INACTIVO</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Correo</div>
            <input
              className="input"
              value={form.correo as string}
              onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))}
            />
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Teléfono</div>
            <input
              className="input"
              value={form.telefono as string}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            />
          </label>
          <label className="block sm:col-span-2">
            <div className="text-[12px] text-gray-600 mb-1">INE</div>
            <input
              className="input"
              value={form.ine as string}
              onChange={(e) => setForm((f) => ({ ...f, ine: e.target.value }))}
            />
          </label>
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary !h-8 !px-3 text-xs" onClick={submit} disabled={saving}>
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordModal({
  user,
  onSaved,
  onClose,
}: {
  user: UserRow;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [confirm, ConfirmUI] = useConfirm();

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!pwd || pwd !== pwd2) return;

    const ok = await confirm({
      title: "Actualizar contraseña",
      message: `¿Actualizar la contraseña de @${user.username}?`,
      confirmText: "Actualizar",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("users_local").update({ password: pwd }).eq("id", user.id);
      if (error) throw error;
      await confirm({ title: "Listo", message: "La contraseña fue actualizada." });
      onSaved();
      onClose();
    } catch (e: any) {
      console.error(e);
      await confirm({
        tone: "danger",
        title: "Error",
        message: e?.message || "No se pudo actualizar la contraseña.",
        confirmText: "Entendido",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50" onClick={onClose}>
      {ConfirmUI}
      <div className="modal-card modal-card-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="text-[13px] font-medium">Actualizar contraseña</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>
        <div className="p-4 grid gap-3 text-[13px]">
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Nueva</div>
            <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </label>
          <label className="block">
            <div className="text-[12px] text-gray-600 mb-1">Confirmar</div>
            <input className="input" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
          </label>
          {pwd && pwd2 && pwd !== pwd2 && <div className="alert alert--error">No coinciden.</div>}
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary !h-8 !px-3 text-xs"
            onClick={submit}
            disabled={!pwd || pwd !== pwd2 || saving}
          >
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== Página ===== */

export default function Usuarios() {
  const me = getUser(); // por si luego condicionas acciones por rol
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [search, setSearch] = useState("");

  const [menu, setMenu] = useState<PortalMenuState>({ open: false, x: 0, y: 0 });

  // modales
  const [viewRow, setViewRow] = useState<UserRow | null>(null);
  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [passRow, setPassRow] = useState<UserRow | null>(null);
  const [docsFor, setDocsFor] = useState<UserRow | null>(null);
  const [assignPobsFor, setAssignPobsFor] = useState<UserRow | null>(null);
  const [assignRoutesFor, setAssignRoutesFor] = useState<UserRow | null>(null);

  const [confirm, ConfirmUI] = useConfirm();

  const from = useMemo(() => (total === 0 ? 0 : (page - 1) * pageSize + 1), [page, pageSize, total]);
  const to = useMemo(() => Math.min(page * pageSize, total), [page, pageSize, total]);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  async function load() {
    const q = search.trim();
    let query = supabase
      .from("users_local")
      .select("id,username,nombre_completo,rol,estado,correo,telefono,ine", { count: "exact" })
      .order("created_at", { ascending: false });

    if (q) query = query.or(`username.ilike.%${q}%,nombre_completo.ilike.%${q}%`);

    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    const { data, error, count } = await query.range(start, end);
    if (error) {
      console.error(error);
      await confirm({
        tone: "danger",
        title: "Error al cargar",
        message: error.message ?? "No se pudieron cargar los usuarios.",
      });
      return;
    }
    setRows((data || []) as any);
    setTotal(count ?? (data?.length ?? 0));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search]);

  function openMenuFor(btn: HTMLButtonElement, row: UserRow) {
    const r = btn.getBoundingClientRect();
    setMenu({
      open: true,
      x: Math.min(window.innerWidth - 260, r.right - 220),
      y: r.bottom + 6,
      row,
    });
  }

  useEffect(() => {
    const close = () => setMenu((s) => ({ ...s, open: false }));
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("click", close);
    };
  }, []);

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar usuario…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select
              className="input input--sm"
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(parseInt(e.target.value));
              }}
            >
              {[5, 8, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                setMenu((s) => ({ ...s, open: false })); // cerrar menú si estaba abierto
                setCreateOpen(true);
              }}
            >
              + Crear nuevo
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame">
        <table className="min-w-full">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>INE</th>
              <th>Teléfono</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[13px] text-gray-500">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id}>
                  <td className="text-[13px]">
                    <div className="font-medium">{u.nombre_completo || "—"}</div>
                    <div className="text-[12px] text-gray-600">@{u.username}</div>
                  </td>
                  <td><span className="badge">{u.rol}</span></td>
                  <td className="text-[13px]">
                    {u.estado === "ACTIVO" ? (
                      <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span>
                    ) : (
                      <span className="text-gray-500">INACTIVO</span>
                    )}
                  </td>
                  <td className="text-[13px]">{u.ine || "—"}</td>
                  <td className="text-[13px]">{u.telefono || "—"}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <button
                        className="btn-outline btn--sm"
                        onClick={(e) => { e.stopPropagation(); setMenu((s)=>({...s, open:false})); setViewRow(u); }}
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </button>
                      <button
                        className="btn-primary btn--sm"
                        onClick={(e) => { e.stopPropagation(); setMenu((s)=>({...s, open:false})); setEditRow(u); }}
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        className="btn-outline btn--sm"
                        onClick={(e) => { e.stopPropagation(); openMenuFor(e.currentTarget, u); }}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer paginación */}
      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">{total === 0 ? "0" : `${from}–${to}`} de {total}</div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page <= 1} onClick={()=>setPage((p)=>Math.max(1,p-1))}>
            {"<"} Anterior
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px]">Página</span>
            <input
              className="input input--sm input--pager"
              value={page}
              onChange={(e) => {
                const v = parseInt(e.target.value || "1", 10);
                if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), pages));
              }}
            />
            <span className="text-[12.5px]">de {pages}</span>
          </div>
          <button className="btn-outline btn--sm" disabled={page >= pages} onClick={()=>setPage((p)=>Math.min(pages,p+1))}>
            Siguiente {">"}
          </button>
        </div>
      </div>

      {/* Portal menú */}
      <PortalMenu
        state={menu}
        onClose={() => setMenu((s) => ({ ...s, open: false }))}
        onPassword={(u) => { setMenu((s)=>({ ...s, open:false })); setPassRow(u); }}
        onAssignPobs={(u) => { setMenu((s)=>({ ...s, open:false })); setAssignPobsFor(u); }}
        onAssignRoutes={(u) => { setMenu((s)=>({ ...s, open:false })); setAssignRoutesFor(u); }}
        onToggle={async (u) => {
          const nuevo = u.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
          const ok = await confirm({
            title: nuevo === "INACTIVO" ? "Marcar INACTIVO" : "Marcar ACTIVO",
            message: `¿Seguro que deseas marcar al usuario @${u.username} como ${nuevo}?`,
            confirmText: "Sí, continuar",
            tone: "warn",
          });
          if (!ok) return;
          const { error } = await supabase.from("users_local").update({ estado: nuevo }).eq("id", u.id);
          if (error) {
            await confirm({ tone: "danger", title: "Error", message: error.message });
            return;
          }
          await confirm({ title: "Actualizado", message: `Usuario @${u.username} ahora está ${nuevo}.` });
          load();
        }}
        onDocs={(u) => { setMenu((s)=>({ ...s, open:false })); setDocsFor(u); }}
        onDelete={async (u) => {
          const ok = await confirm({
            title: "Eliminar usuario",
            message: (
              <>
                Esta acción no se puede deshacer.
                <br />
                ¿Eliminar al usuario <strong>@{u.username}</strong>?
              </>
            ) as any,
            confirmText: "Eliminar",
            tone: "danger",
          });
          if (!ok) return;
          const { error } = await supabase.from("users_local").delete().eq("id", u.id);
          if (error) {
            await confirm({ tone: "danger", title: "Error", message: error.message });
            return;
          }
          await confirm({ title: "Eliminado", message: `El usuario @${u.username} fue eliminado.` });
          load();
        }}
      />

      {/* Modales */}
      {viewRow && <ViewUserModal row={viewRow} onClose={() => setViewRow(null)} />}
      {editRow && <EditUserModal initial={editRow} onSaved={load} onClose={() => setEditRow(null)} />}
      {createOpen && <EditUserModal onSaved={load} onClose={() => setCreateOpen(false)} />}
      {passRow && <PasswordModal user={passRow} onSaved={load} onClose={() => setPassRow(null)} />}
      {docsFor && (
        <UserDocumentsModal
          userId={docsFor.id}
          username={docsFor.username}
          onClose={() => setDocsFor(null)}
        />
      )}
      {assignPobsFor && (
        <AssignPopulationsModal
          capturistaId={assignPobsFor.id}
          onClose={() => setAssignPobsFor(null)}
        />
      )}
      {assignRoutesFor && (
        <AssignRoutesModal
          capturistaId={assignRoutesFor.id}
          onClose={() => setAssignRoutesFor(null)}
        />
      )}

      {/* Confirm UI */}
      {ConfirmUI}
    </div>
  );
}
