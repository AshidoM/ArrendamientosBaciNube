import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { getPlansBySujeto, getMontosFor, getCuotaFor, Sujeto } from "../lib/creditPlans";
import {
  Plus, Eye, Edit3, Trash2, MoreVertical, Save, X
} from "lucide-react";

/* ------------ Tipos (db) ------------ */
type Credito = {
  id: number;
  folio: string | null;
  sujeto: "CLIENTE" | "COORDINADORA";
  cliente_id: number | null;
  coordinadora_id: number | null;
  poblacion_id: number;
  ruta_id: number;
  plan_id: number;
  semanas: number;
  monto_principal: number;
  cuota_semanal: number;
  papeleria_aplicada: number;
  estado: "ACTIVO" | "REZAGADO" | "FINALIZADO";
  fecha_disposicion: string;
  observaciones: string | null;
  created_at?: string;
};

type Persona = {
  id: number;
  nombre: string;
  poblacion_id: number | null;
  poblacion?: string | null;
  ruta_id?: number | null;
  ruta?: string | null;
};

type PlanRow = { id: number; sujeto: Sujeto; semanas: number; activo: boolean };

type Multa = { id: number; tipo: "M15"; estado: "ACTIVO" | "INACTIVO"; monto: number };

/* ===================================================== */
/* ===================== PÁGINA ======================== */
/* ===================================================== */

export default function Creditos() {
  const [rows, setRows] = useState<Credito[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [q, setQ] = useState("");

  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; row?: Credito }>({ open: false, x: 0, y: 0 });

  // modales
  const [viewRow, setViewRow] = useState<Credito | null>(null);
  const [editRow, setEditRow] = useState<Credito | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Trae resumen con joins a ruta/población y titular
    let query = supabase
      .from("vw_credito_resumen")
      .select("*", { count: "exact" })
      .order("credito_id", { ascending: false });

    const qq = q.trim();
    if (qq) query = query.or(`folio.ilike.%${qq}%,titular.ilike.%${qq}%,ruta.ilike.%${qq}%,poblacion.ilike.%${qq}%`);

    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error(error);
      return;
    }
    // mapea a Credito-like para tabla
    const mapped: Credito[] = (data || []).map((r: any) => ({
      id: r.credito_id,
      folio: r.folio,
      sujeto: r.sujeto,
      cliente_id: null,
      coordinadora_id: null,
      poblacion_id: r.poblacion_id,
      ruta_id: r.ruta_id,
      plan_id: 0,
      semanas: r.semanas,
      monto_principal: r.monto_principal,
      cuota_semanal: r.cuota_semanal,
      papeleria_aplicada: r.papeleria_aplicada,
      estado: r.estado,
      fecha_disposicion: "",
      observaciones: null,
    }));
    setRows(mapped);
    setTotal(count ?? mapped.length);
  }
  useEffect(() => {
    load(); // eslint-disable-next-line
  }, [page, pageSize, q]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function openMenuFor(btn: HTMLButtonElement, row: Credito) {
    const r = btn.getBoundingClientRect();
    setMenu({ open: true, x: Math.min(window.innerWidth - 220, r.right - 200), y: r.bottom + 6, row });
  }

  async function removeRow(row: Credito) {
    if (!confirm(`¿Eliminar crédito ${row.folio ?? row.id}?`)) return;
    const { error } = await supabase.from("creditos").delete().eq("id", row.id);
    if (!error) load();
  }

  return (
    <div className="max-w-[1200px]">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar crédito o titular…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
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
              {[5, 8, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary btn--sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Crear crédito
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
              <th>Titular</th>
              <th>Semanas</th>
              <th>Monto</th>
              <th>Cuota</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[13px] text-gray-500">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-[13px]">{r.folio ?? `CR-${r.id}`}</td>
                  <td className="text-[13px]">{/* título llega por view; para lista bastan montos/estado */}—</td>
                  <td className="text-[13px]">{r.semanas}</td>
                  <td className="text-[13px]">${r.monto_principal.toFixed(2)}</td>
                  <td className="text-[13px]">${r.cuota_semanal.toFixed(2)}</td>
                  <td className="text-[13px]">{r.estado}</td>
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
                        onClick={(e) => {
                          e.stopPropagation();
                          openMenuFor(e.currentTarget, r);
                        }}
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
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </button>
          <span className="text-[12.5px]">Página</span>
          <input
            className="input input--sm input--pager"
            value={page}
            onChange={(e) => setPage(Math.max(1, parseInt(e.target.value || "1")))}
          />
          <span className="text-[12.5px]">de {pages}</span>
          <button
            className="btn-outline btn--sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Menú portal */}
      {menu.open &&
        menu.row &&
        createPortal(
          <div className="portal-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <button
              className="portal-menu__item"
              onClick={() => {
                setEditRow(menu.row!);
                setMenu((s) => ({ ...s, open: false }));
              }}
            >
              <Edit3 className="w-4 h-4" /> Editar
            </button>
            <button
              className="portal-menu__item portal-menu__item--danger"
              onClick={() => {
                removeRow(menu.row!);
                setMenu((s) => ({ ...s, open: false }));
              }}
            >
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
          </div>,
          document.body
        )}

      {/* Modales */}
      {viewRow && <ViewCredito row={viewRow} onClose={() => setViewRow(null)} />}
      {editRow && <UpsertCredito initial={editRow} onSaved={() => { setEditRow(null); load(); }} onClose={() => setEditRow(null)} />}
      {createOpen && <UpsertCredito onSaved={() => { setCreateOpen(false); load(); }} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

/* ===================== Ver ===================== */
function ViewCredito({ row, onClose }: { row: Credito; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10010] grid place-items-center bg-black/50">
      <div className="w-[92vw] max-w-xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="modal-head">
          <div className="text-[13px] font-medium">Crédito</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>
        <div className="p-4 grid gap-2 text-[13px]">
          <div><strong>Folio:</strong> {row.folio ?? `CR-${row.id}`}</div>
          <div><strong>Sujeto:</strong> {row.sujeto}</div>
          <div><strong>Semanas:</strong> {row.semanas}</div>
          <div><strong>Monto:</strong> ${row.monto_principal.toFixed(2)}</div>
          <div><strong>Cuota:</strong> ${row.cuota_semanal.toFixed(2)}</div>
          <div><strong>Estado:</strong> {row.estado}</div>
        </div>
      </div>
    </div>
  );
}

/* ========== Crear/Editar: Tabs Datos / Resumen ========== */
function UpsertCredito({
  initial,
  onSaved,
  onClose,
}: {
  initial?: Partial<Credito>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"datos" | "resumen">("datos");
  const [sujeto, setSujeto] = useState<Sujeto>((initial?.sujeto as Sujeto) || "CLIENTE");
  const [titular, setTitular] = useState<Persona | null>(null);

  const [planes, setPlanes] = useState<PlanRow[]>([]);
  const [semanas, setSemanas] = useState<number | null>(initial?.semanas ?? null);
  const [monto, setMonto] = useState<number | null>(initial?.monto_principal ?? null);
  const [cuota, setCuota] = useState<number | null>(initial?.cuota_semanal ?? null);

  const [folio, setFolio] = useState<string>(initial?.folio || "");
  const [papeleria, setPapeleria] = useState<number>(initial?.papeleria_aplicada ?? 0);
  const [fecha, setFecha] = useState<string>(() => {
    if (initial?.fecha_disposicion) return initial.fecha_disposicion;
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [obs, setObs] = useState<string>(initial?.observaciones ?? "");
  const [saving, setSaving] = useState(false);

  // Búsqueda de personas
  const [search, setSearch] = useState("");
  const [candidatos, setCandidatos] = useState<Persona[]>([]);
  useEffect(() => {
    async function run() {
      const qq = search.trim();
      if (!qq) {
        setCandidatos([]);
        return;
      }
      const table = sujeto === "CLIENTE" ? "clientes" : "coordinadoras";
      let q = supabase
        .from(table)
        .select("id,nombre,poblacion_id,poblaciones: poblacion_id ( id,nombre,ruta_id,rutas: ruta_id ( id,nombre ) )")
        .ilike("nombre", `%${qq}%`)
        .limit(5);
      const { data } = await q as any;
      const list: Persona[] =
        (data || []).map((r: any) => ({
          id: r.id,
          nombre: r.nombre,
          poblacion_id: r.poblacion_id,
          poblacion: r.poblaciones?.nombre ?? null,
          ruta_id: r.poblaciones?.rutas?.id ?? null,
          ruta: r.poblaciones?.rutas?.nombre ?? null,
        })) || [];
      setCandidatos(list);
    }
    run();
  }, [search, sujeto]);

  useEffect(() => {
    // Carga planes válidos (pero UI usa creditPlans.ts para montos/cuotas)
    async function get() {
      const { data } = await supabase.from("planes").select("*").eq("activo", true).eq("sujeto", sujeto);
      setPlanes((data || []) as any);
    }
    get();
  }, [sujeto]);

  // Montos y cuota por sujeto/semanas
  const montos = useMemo(() => (semanas ? getMontosFor(sujeto, semanas) : []), [sujeto, semanas]);
  useEffect(() => {
    if (semanas && monto != null) {
      const c = getCuotaFor(sujeto, semanas, monto);
      setCuota(c);
    } else setCuota(null);
  }, [sujeto, semanas, monto]);

  // Resumen neto (consulta m15/cartera vencida si el titular ya existe)
  const [m15, setM15] = useState<number>(0);
  const [cartera, setCartera] = useState<number>(0);
  useEffect(() => {
    async function fetchDeudas() {
      if (!titular) {
        setM15(0);
        setCartera(0);
        return;
      }
      // M15 activa
      const { data: multas } = await supabase
        .from("multas")
        .select("monto,estado")
        .eq("estado", "ACTIVO")
        .in("credito_id", []) as any; // no amarramos a créditos aquí; 0 para nuevo
      setM15(0);
      setCartera(0);
    }
    fetchDeudas();
  }, [titular]);

  const neto = useMemo(() => {
    const m = monto || 0;
    const p = papeleria || 0;
    return Math.max(0, m - p - m15 - cartera);
  }, [monto, papeleria, m15, cartera]);

  async function save() {
    if (!titular || !semanas || !monto || !cuota) {
      alert("Falta sujeto/titular/plan/monto.");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        sujeto,
        cliente_id: sujeto === "CLIENTE" ? titular.id : null,
        coordinadora_id: sujeto === "COORDINADORA" ? titular.id : null,
        poblacion_id: titular.poblacion_id,
        ruta_id: titular.ruta_id,
        plan_id: (planes.find((p) => p.semanas === semanas)?.id ?? null),
        semanas,
        monto_principal: monto,
        cuota_semanal: cuota,
        papeleria_aplicada: papeleria,
        estado: "ACTIVO",
        fecha_disposicion: fecha,
        observaciones: obs || null,
      };
      let q = supabase.from("creditos");
      if (initial?.id) {
        const { error } = await q.update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await q.insert(payload);
        if (error) throw error;
      }
      alert("Guardado.");
      onSaved();
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab === "datos" ? "nav-active" : ""}`} onClick={() => setTab("datos")}>
              Datos
            </button>
            <button
              className={`btn-ghost !h-8 !px-3 text-xs ${tab === "resumen" ? "nav-active" : ""}`}
              onClick={() => setTab("resumen")}
            >
              Resumen
            </button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {/* DATOS */}
        {tab === "datos" && (
          <>
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              <Field label="Sujeto">
                <select
                  className="input"
                  value={sujeto}
                  onChange={(e) => {
                    const s = e.target.value as Sujeto;
                    setSujeto(s);
                    setTitular(null);
                    setSemanas(null);
                    setMonto(null);
                    setCuota(null);
                  }}
                >
                  <option>CLIENTE</option>
                  <option>COORDINADORA</option>
                </select>
              </Field>
              <Field label={sujeto === "CLIENTE" ? "Cliente" : "Coordinadora"}>
                <input
                  className="input"
                  placeholder={`Buscar ${sujeto.toLowerCase()}…`}
                  value={titular ? titular.nombre : ""}
                  onChange={(e) => {
                    setTitular(null);
                    setSearch(e.target.value);
                  }}
                />
                {!!(!titular && search.trim() && candidatos.length > 0) && (
                  <div className="mt-2 border rounded-2 max-h-40 overflow-auto">
                    {candidatos.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-[13px]"
                        onClick={() => {
                          setTitular(c);
                          setSearch("");
                        }}
                      >
                        {c.nombre} {c.poblacion ? `• ${c.poblacion}` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Semanas">
                <select
                  className="input"
                  value={semanas ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value || "0");
                    setSemanas(n || null);
                    setMonto(null);
                  }}
                >
                  <option value="">—</option>
                  {getPlansBySujeto(sujeto)
                    .filter((p) =>
                      sujeto === "CLIENTE" ? (p.semanas === 14 || p.semanas === 13) : (p.semanas === 10 || p.semanas === 9)
                    )
                    .map((p) => (
                      <option key={p.semanas} value={p.semanas}>
                        {p.semanas}
                      </option>
                    ))}
                </select>
              </Field>

              <Field label="Monto">
                <select
                  className="input"
                  value={monto ?? ""}
                  onChange={(e) => setMonto(parseInt(e.target.value || "0") || null)}
                  disabled={!semanas}
                >
                  <option value="">—</option>
                  {montos.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Cuota semanal">
                <input className="input" value={cuota ?? ""} readOnly />
              </Field>

              <Field label="Papelería">
                <input
                  className="input"
                  type="number"
                  value={papeleria}
                  onChange={(e) => setPapeleria(parseFloat(e.target.value || "0"))}
                />
              </Field>

              <Field label="Fecha de disposición">
                {/* sin ícono sobrepuesto */}
                <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Field>

              <Field label="Folio (opcional)">
                <input className="input" value={folio} onChange={(e) => setFolio(e.target.value)} />
              </Field>

              <label className="block sm:col-span-2">
                <div className="text-[12px] text-gray-600 mb-1">Observaciones</div>
                <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
              </label>
            </div>

            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
                Cancelar
              </button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={() => setTab("resumen")} disabled={!titular || !semanas || !monto || !cuota}>
                Ver resumen
              </button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={save} disabled={saving || !titular || !semanas || !monto || !cuota}>
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          </>
        )}

        {/* RESUMEN */}
        {tab === "resumen" && (
          <div className="p-4 grid gap-2 text-[13px]">
            <div><strong>Titular:</strong> {titular?.nombre ?? "—"}</div>
            <div><strong>Población:</strong> {titular?.poblacion ?? "—"} • <strong>Ruta:</strong> {titular?.ruta ?? "—"}</div>
            <div><strong>Sujeto:</strong> {sujeto} • <strong>Semanas:</strong> {semanas ?? "—"}</div>
            <div><strong>Monto:</strong> ${monto?.toFixed(2) ?? "—"} • <strong>Cuota:</strong> ${cuota?.toFixed(2) ?? "—"}</div>
            <div><strong>Papelería:</strong> ${papeleria.toFixed(2)}</div>
            <div><strong>Cartera vencida:</strong> ${cartera.toFixed(2)} • <strong>M15:</strong> ${m15.toFixed(2)}</div>
            <div className="mt-2 text-lg font-semibold">Efectivo neto a entregar: ${neto.toFixed(2)}</div>

            <div className="pt-3 border-t flex justify-end gap-2">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setTab("datos")}>Volver</button>
              <button className="btn-primary !h-8 !px-3 text-xs" onClick={save} disabled={saving || !titular || !semanas || !monto || !cuota}>
                <Save className="w-4 h-4" /> Guardar
              </button>
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
