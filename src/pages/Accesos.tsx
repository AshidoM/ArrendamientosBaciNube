// src/pages/Accesos.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getMyRole } from "../lib/authz";

type Poblacion = {
  id: number;
  nombre: string;
  municipio?: string | null;
  estado_mx?: string | null;
  ruta_id?: number | null;
};
type Capturista = { id: string; username?: string | null };
type Asignado = { capturista_id: string; activo: boolean };

async function isAdmin(): Promise<boolean> {
  const r = await getMyRole();
  return r === "ADMIN";
}

async function searchPoblaciones(q: string): Promise<Poblacion[]> {
  let req = supabase
    .from("poblaciones")
    .select("id,nombre,municipio,estado_mx,ruta_id")
    .order("id", { ascending: true })
    .limit(50);
  const s = q.trim();
  if (s.length >= 2) req = req.ilike("nombre", `%${s}%`);
  const { data, error } = await req;
  if (error) throw error;
  return (data || []) as Poblacion[];
}

// OJO: aquí ya no pedimos "nombre" porque no existe en users_local.
// Buscamos por username únicamente (si luego agregas columna, se puede ampliar).
async function listCapturistas(q: string): Promise<Capturista[]> {
  let req = supabase
    .from("users_local")
    .select("id,username,rol")
    .eq("rol", "CAPTURISTA")
    .order("username", { ascending: true })
    .limit(50);
  const s = q.trim();
  if (s.length >= 2) req = req.ilike("username", `%${s}%`);
  const { data, error } = await req;
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: r.id, username: r.username })) as Capturista[];
}

async function listAsignados(poblacionId: number): Promise<Asignado[]> {
  const { data, error } = await supabase
    .from("capturista_poblaciones")
    .select("capturista_id,activo")
    .eq("poblacion_id", poblacionId)
    .order("capturista_id", { ascending: true });
  if (error) throw error;
  return (data || []) as Asignado[];
}

async function addAsignacion(poblacionId: number, capturistaId: string): Promise<void> {
  const { error } = await supabase
    .from("capturista_poblaciones")
    .upsert(
      { poblacion_id: poblacionId, capturista_id: capturistaId, activo: true },
      { onConflict: "poblacion_id,capturista_id" }
    );
  if (error) throw error;
}

async function removeAsignacion(poblacionId: number, capturistaId: string): Promise<void> {
  const { error } = await supabase
    .from("capturista_poblaciones")
    .delete()
    .eq("poblacion_id", poblacionId)
    .eq("capturista_id", capturistaId);
  if (error) throw error;
}

export default function Accesos() {
  const [admin, setAdmin] = useState<boolean>(false);

  const [qPop, setQPop] = useState("");
  const [pobs, setPobs] = useState<Poblacion[]>([]);
  const [sel, setSel] = useState<Poblacion | null>(null);

  const [qCap, setQCap] = useState("");
  const [caps, setCaps] = useState<Capturista[]>([]);
  const [asig, setAsig] = useState<Asignado[]>([]);

  const [loadingPobs, setLoadingPobs] = useState(false);
  const [loadingAsig, setLoadingAsig] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    isAdmin().then(setAdmin).catch(() => setAdmin(false));
  }, []);

  useEffect(() => {
    setLoadingPobs(true);
    setErr(null);
    searchPoblaciones(qPop)
      .then(setPobs)
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoadingPobs(false));
  }, [qPop]);

  useEffect(() => {
    setErr(null);
    listCapturistas(qCap)
      .then(setCaps)
      .catch((e) => setErr(e.message || String(e)));
  }, [qCap]);

  useEffect(() => {
    if (!sel?.id) { setAsig([]); return; }
    setLoadingAsig(true);
    setErr(null);
    listAsignados(sel.id)
      .then(setAsig)
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoadingAsig(false));
  }, [sel?.id]);

  const assignedIds = useMemo(() => new Set(asig.map(a => a.capturista_id)), [asig]);

  async function handleAdd(c: Capturista) {
    if (!sel?.id) return;
    setErr(null); setMsg(null);
    try {
      await addAsignacion(sel.id, c.id);
      const rows = await listAsignados(sel.id);
      setAsig(rows);
      setMsg(`Asignado ${c.username || c.id} a ${sel.nombre}`);
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  async function handleRemove(c: Capturista) {
    if (!sel?.id) return;
    setErr(null); setMsg(null);
    try {
      await removeAsignacion(sel.id, c.id);
      const rows = await listAsignados(sel.id);
      setAsig(rows);
      setMsg(`Removido ${c.username || c.id} de ${sel.nombre}`);
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  if (!admin) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-head__title">Accesos por población</div>
            <div className="page-head__subtitle">Solo ADMIN puede administrar asignaciones</div>
          </div>
        </div>
        <div className="alert alert--error">No tienes permisos para ver esta sección.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-head__title">Accesos por población</div>
          <div className="page-head__subtitle">
            Asigna capturistas a poblaciones. Estas asignaciones controlan el acceso a Créditos, Pagos, Multas e Historial.
          </div>
        </div>
        <div className="badge">ADMIN</div>
      </div>

      <div className="accesos">
        {/* Columna de poblaciones */}
        <div className="accesos__col">
          <div className="accesos__panel">
            <div className="accesos__head">
              <div className="accesos__title">Poblaciones</div>
              <div className="text-muted">{loadingPobs ? "Cargando…" : `${pobs.length} resultado(s)`}</div>
            </div>
            <div className="accesos__body">
              <div className="field">
                <label className="label">Buscar población</label>
                <input
                  className="input input--sm dt__search--sm"
                  value={qPop}
                  onChange={(e) => setQPop(e.target.value)}
                  placeholder="Min 2 letras para filtrar"
                />
              </div>
              <div className="accesos__list">
                {loadingPobs && <div className="accesos__empty">Cargando…</div>}
                {!loadingPobs && pobs.length === 0 && <div className="accesos__empty">Sin resultados.</div>}
                {pobs.map((p) => (
                  <div
                    key={p.id}
                    className={`accesos__item ${sel?.id === p.id ? "accesos__item--active" : ""}`}
                    onClick={() => setSel(p)}
                  >
                    <div style={{ fontWeight: 700 }}>{p.nombre}</div>
                    <div className="accesos__meta">{p.municipio || "—"} · {p.estado_mx || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Columna de asignaciones */}
        <div className="accesos__col">
          <div className="accesos__panel">
            <div className="accesos__head">
              <div className="accesos__title">Asignaciones</div>
              {sel && <div className="text-muted">Población: <strong>{sel.nombre}</strong> · ID {sel.id}</div>}
            </div>

            <div className="accesos__body">
              {!sel && <div className="accesos__empty">Selecciona una población de la lista…</div>}

              {sel && (
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Asignadas */}
                    <div className="card" style={{ overflow: "hidden" }}>
                      <div className="accesos__head">
                        <div className="accesos__title">Capturistas asignadas</div>
                        <div className="text-muted">{loadingAsig ? "Cargando…" : `${asig.length}`}</div>
                      </div>
                      <div className="accesos__list" style={{ maxHeight: 420 }}>
                        {!loadingAsig && asig.length === 0 && <div className="accesos__empty">Sin capturistas asignadas.</div>}
                        {asig.map((a) => {
                          const c = caps.find(x => x.id === a.capturista_id);
                          const label = c ? (c.username || c.id) : a.capturista_id;
                          return (
                            <div key={a.capturista_id} className="accesos__row">
                              <div>
                                <div style={{ fontWeight: 700 }}>{label}</div>
                                <div className="accesos__meta">{c?.id}</div>
                              </div>
                              <button className="btn-outline btn--sm" onClick={() => c && handleRemove(c)}>Quitar</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Buscar/Añadir */}
                    <div className="card" style={{ overflow: "hidden" }}>
                      <div className="accesos__head">
                        <div className="accesos__title">Buscar capturistas</div>
                        <div className="text-muted">{caps.length}</div>
                      </div>
                      <div className="accesos__body">
                        <div className="field" style={{ marginBottom: 8 }}>
                          <label className="label">Buscar</label>
                          <input
                            className="input input--sm"
                            value={qCap}
                            onChange={(e) => setQCap(e.target.value)}
                            placeholder="Username…"
                          />
                        </div>
                        <div className="accesos__list" style={{ maxHeight: 420 }}>
                          {caps.map((c) => {
                            const already = assignedIds.has(c.id);
                            return (
                              <div key={c.id} className="accesos__row">
                                <div>
                                  <div style={{ fontWeight: 700 }}>{c.username || "—"}</div>
                                  <div className="accesos__meta">{c.id}</div>
                                </div>
                                <button className="btn-primary btn--sm" onClick={() => handleAdd(c)} disabled={already}>
                                  {already ? "Ya asignada" : "Añadir"}
                                </button>
                              </div>
                            );
                          })}
                          {caps.length === 0 && <div className="accesos__empty">Escribe al menos 2 caracteres.</div>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {msg && <div className="alert" style={{ border: "1px solid #d1fae5", background: "#ecfdf5", color: "#065f46" }}>{msg}</div>}
                  {err && <div className="alert alert--error">{err}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
