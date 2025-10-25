// src/components/CreditoWizard.tsx
import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Save, RefreshCcw } from "lucide-react";
import { supabase } from "../lib/supabase";

import { getPlanIdPor } from "../services/planes.service";
import { getNextFolioAuto, folioDisponible } from "../services/creditos.service";
import {
  getMontosValidos,
  getCuotaSemanal,
  type SujetoCredito,
} from "../services/montos.service";
import {
  getCostosPapeleria,
  type CostoPapeleria,
} from "../services/papeleria.service";
import {
  prepararRenovacionResumen,
  ejecutarRenovacion,
  type RenovacionResumen,
} from "../services/renovacion.service";
import {
  getAsignacionGeo,
  getTitularYGeoDeCredito,
  type TitularLite,
} from "../services/titulares.service";

import TitularPicker, { type TitularPicked } from "./TitularPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  renovacionOrigen?: { creditoId: number } | null;
};

function addDays(base: Date | string, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtMoney(n: number) {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

export default function CreditoWizard({
  open,
  onClose,
  onCreated,
  renovacionOrigen,
}: Props) {
  const [tab, setTab] = useState<"titular" | "datos" | "resumen">("titular");
  const esRenovacion = !!renovacionOrigen?.creditoId;

  // -------- Titular --------
  const [sujeto, setSujeto] = useState<SujetoCredito>("CLIENTE");
  const [titular, setTitular] = useState<TitularLite | TitularPicked | null>(null);
  const [titularNombre, setTitularNombre] = useState<string>("—"); // lectura en renovación

  // Asignación automática de geo/plan
  const [poblacion, setPoblacion] = useState<{ id: number; nombre: string } | null>(null);
  const [ruta, setRuta] = useState<{ id: number; nombre: string } | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);

  // -------- Datos --------
  const [semanas, setSemanas] = useState<number>(14);

  const [montos, setMontos] = useState<{ id: number; monto: number }[]>([]);
  const [montoId, setMontoId] = useState<number | null>(null);

  const [papelerias, setPapelerias] = useState<CostoPapeleria[]>([]);
  const [papeleriaId, setPapeleriaId] = useState<number | null>(null);

  // Folio externo
  const [folioMode, setFolioMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [folioExterno, setFolioExterno] = useState<string>("");
  const [folioOk, setFolioOk] = useState<null | boolean>(null);
  const [checkingFolio, setCheckingFolio] = useState(false);

  // Fechas (ambas seleccionables)
  const [fechaDisp, setFechaDisp] = useState<string>(fmtISO(new Date()));
  const primerPagoSugerido = useMemo(
    () => fmtISO(addDays(fechaDisp, 7)),
    [fechaDisp]
  );
  const [primerPago, setPrimerPago] = useState<string>(""); // si vacío, se usa sugerido
  const primerPagoEfectivo = primerPago || primerPagoSugerido;

  // Resumen (renovación)
  const [renResumen, setRenResumen] = useState<RenovacionResumen | null>(null);

  // Helpers
  const monto = useMemo(
    () => Number(montos.find((x) => x.id === montoId)?.monto ?? 0),
    [montoId, montos]
  );
  const cuota = useMemo(() => getCuotaSemanal(monto, semanas), [monto, semanas]);
  const papMonto = useMemo(
    () => Number(papelerias.find((p) => p.id === papeleriaId)?.monto ?? 0),
    [papelerias, papeleriaId]
  );

  const semanasOptions = useMemo(
    () => (sujeto === "CLIENTE" ? [14, 13] : [10, 9]),
    [sujeto]
  );

  // -------- Precarga Renovación --------
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!esRenovacion || !renovacionOrigen?.creditoId) {
        setRenResumen(null);
        return;
      }

      // 1) Resumen (descuentos/renovable)
      const r = await prepararRenovacionResumen(
        supabase,
        renovacionOrigen.creditoId
      );
      if (!alive) return;
      setRenResumen(r);

      // 2) Sujeto/semanas/folio sugerido/plan
      setSujeto(r.sujeto);
      setSemanas(r.semanasNuevo);
      setFolioMode("AUTO");
      setFolioExterno(String(r.folioNuevoSugerido));
      setFolioOk(true);
      setPrimerPago("");

      const pid = await getPlanIdPor(supabase, r.sujeto, r.semanasNuevo);
      if (!alive) return;
      setPlanId(pid);

      // 3) Cargar titular + geo directamente del crédito (nombre, población, ruta)
      try {
        const tg = await getTitularYGeoDeCredito(supabase, renovacionOrigen.creditoId);
        if (!alive) return;
        setTitularNombre(tg.nombre || "—");
        setPoblacion({ id: tg.poblacion_id, nombre: tg.poblacion });
        setRuta({ id: tg.ruta_id, nombre: tg.ruta });
      } catch {
        // fallback: intentar derivarlo por titular
        try {
          if (r.titular_id) {
            const geo = await getAsignacionGeo(supabase, r.sujeto, r.titular_id);
            if (!alive) return;
            setPoblacion({ id: geo.poblacion_id, nombre: geo.poblacion });
            setRuta({ id: geo.ruta_id, nombre: geo.ruta });
          }
        } catch {
          setPoblacion(null);
          setRuta(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRenovacion, renovacionOrigen?.creditoId]);

  // Selección de titular ⇒ geo + plan (solo ALTA)
  async function onPickedTitular(t: TitularPicked) {
    setTitular(t);
    setTitularNombre((t as any).nombre || "—");

    const pid = await getPlanIdPor(supabase, sujeto, semanas);
    setPlanId(pid);

    if ((t as any).poblacionId && (t as any).rutaId) {
      setPoblacion({ id: (t as any).poblacionId, nombre: (t as any).poblacionNombre || "—" });
      setRuta({ id: (t as any).rutaId, nombre: (t as any).rutaNombre || "—" });
      return;
    }

    try {
      const geo = await getAsignacionGeo(supabase, sujeto, t.id);
      setPoblacion({ id: geo.poblacion_id, nombre: geo.poblacion });
      setRuta({ id: geo.ruta_id, nombre: geo.ruta });
    } catch {
      setPoblacion(null);
      setRuta(null);
    }
  }

  // Cambian sujeto/semanas ⇒ recalcular plan
  useEffect(() => {
    let alive = true;
    (async () => {
      const pid = await getPlanIdPor(supabase, sujeto, semanas);
      if (!alive) return;
      setPlanId(pid);
    })();
    return () => {
      alive = false;
    };
  }, [sujeto, semanas]);

  // Montos válidos
  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await getMontosValidos(supabase, sujeto, semanas);
      if (!alive) return;
      setMontos(list);
      if (list.length === 0) setMontoId(null);
      else if (!list.some((x) => x.id === montoId)) {
        if (esRenovacion && renResumen) {
          const same = list.find(
            (x) => Number(x.monto) === Number(renResumen.montoNuevo)
          );
          setMontoId(same ? same.id : list[0].id);
        } else {
          setMontoId(list[0].id);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sujeto, semanas, esRenovacion, renResumen?.montoNuevo]);

  // Papelerías
  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await getCostosPapeleria(supabase);
      if (!alive) return;
      setPapelerias(list);
      if (list.length > 0 && !papeleriaId) setPapeleriaId(list[0].id);
    })();
    return () => {
      alive = false;
    };
  }, []); // una vez

  // Folio auto/manual (solo ALTA)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (esRenovacion) return;
      if (folioMode === "AUTO") {
        const next = await getNextFolioAuto();
        if (!alive) return;
        setFolioExterno(String(next));
        setFolioOk(true);
      } else {
        setFolioExterno("");
        setFolioOk(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [folioMode, esRenovacion]);

  async function checkFolio() {
    if (!folioExterno) return;
    setCheckingFolio(true);
    try {
      const ok = await folioDisponible(folioExterno);
      setFolioOk(ok);
    } finally {
      setCheckingFolio(false);
    }
  }

  // Validaciones
  const titularOk = esRenovacion ? true : !!titular && !!poblacion?.id && !!ruta?.id;
  const fechasOk = !!fechaDisp && !!primerPagoEfectivo && primerPagoEfectivo >= fechaDisp;

  const datosOk =
    !!montoId && !!semanas && !!folioExterno && folioOk !== false &&
    !!papeleriaId && !!planId && fechasOk;

  // Crear (alta / renovación)
  async function crearCredito() {
    if (!datosOk) return;

    // Validación/recuperación de geo en renovación
    if (esRenovacion && (!poblacion?.id || !ruta?.id) && renResumen?.titular_id) {
      try {
        const geo = await getAsignacionGeo(supabase, renResumen.sujeto, renResumen.titular_id);
        setPoblacion({ id: geo.poblacion_id, nombre: geo.poblacion });
        setRuta({ id: geo.ruta_id, nombre: geo.ruta });
      } catch { /* no-op */ }
    }
    if (!poblacion?.id || !ruta?.id) {
      alert("No hay asignación de Población/Ruta para el titular. Asigna geo primero.");
      return;
    }

    const payloadNuevo: any = {
      sujeto,
      semanas,
      monto_principal: monto,
      cuota_semanal: cuota,
      fecha_disposicion: fechaDisp,
      primer_pago: primerPagoEfectivo,
      folio_externo: Number(folioExterno),
      papeleria_aplicada: papMonto,
      plan_id: planId,
      poblacion_id: poblacion.id,
      ruta_id: ruta.id,
    };

    if (!esRenovacion) {
      const titularCol = sujeto === "CLIENTE" ? "cliente_id" : "coordinadora_id";
      payloadNuevo[titularCol] = titular?.id ?? null;
      const { error } = await supabase.from("creditos").insert(payloadNuevo);
      if (error) {
        alert(error.message);
        return;
      }
    } else {
      // titular del crédito origen
      if (renResumen?.titular_id) {
        const titularCol = sujeto === "CLIENTE" ? "cliente_id" : "coordinadora_id";
        payloadNuevo[titularCol] = renResumen.titular_id;
      }
      await ejecutarRenovacion(supabase, renovacionOrigen!.creditoId, payloadNuevo);
    }

    onCreated();
    onClose();
  }

  if (!open) return null;

  // Descuentos (UI) para renovación
  const totalDescuentos = useMemo(() => {
    if (!renResumen) return papMonto || 0;
    return (
      Number((renResumen as any).pendienteNoVencido || 0) +
      Number(renResumen.carteraVencida || 0) +
      Number(renResumen.multaM15Activa || 0) +
      Number(papMonto || 0) +
      Number((renResumen as any).descuentoExtra || 0)
    );
  }, [renResumen, papMonto]);

  const netoAEntregar = Math.max(0, (monto || 0) - totalDescuentos);

  return (
    <div className="modal">
      <div className="modal-card modal-card-lg">
        {/* Head */}
        <div className="modal-head">
          <div className="text-[13px] font-medium">
            {esRenovacion ? "Renovar crédito" : "Nuevo crédito"}
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {/* Tabs */}
        <div className="px-3 pt-2 flex items-center gap-2 border-b">
          <button
            className={`btn-ghost !h-8 !px-3 text-xs ${tab === "titular" ? "nav-active" : ""}`}
            onClick={() => setTab("titular")}
            disabled={esRenovacion}
          >
            Titular
          </button>
          <button
            className={`btn-ghost !h-8 !px-3 text-xs ${tab === "datos" ? "nav-active" : ""}`}
            onClick={() => setTab("datos")}
            disabled={!titularOk}
          >
            Datos
          </button>
          <button
            className={`btn-ghost !h-8 !px-3 text-xs ${tab === "resumen" ? "nav-active" : ""}`}
            onClick={() => setTab("resumen")}
            disabled={!datosOk}
          >
            Resumen
          </button>
        </div>

        {/* Body */}
        {tab === "titular" ? (
          <div className="p-4 grid gap-3">
            {!esRenovacion && (
              <>
                <div className="grid sm:grid-cols-4 gap-3">
                  <label className="block">
                    <div className="text-[12px] text-gray-600 mb-1">Sujeto</div>
                    <select
                      className="input"
                      value={sujeto}
                      onChange={(e) => {
                        const next = e.target.value as SujetoCredito;
                        setSujeto(next);
                        setSemanas(next === "CLIENTE" ? 14 : 10);
                        setTitular(null);
                        setTitularNombre("—");
                        setPoblacion(null);
                        setRuta(null);
                      }}
                      disabled={esRenovacion}
                    >
                      <option value="CLIENTE">Cliente</option>
                      <option value="COORDINADORA">Coordinadora</option>
                    </select>
                  </label>

                  <label className="block sm:col-span-1">
                    <div className="text-[12px] text-gray-600 mb-1">
                      Buscar {sujeto === "CLIENTE" ? "cliente" : "coordinadora"}
                    </div>
                    <TitularPicker
                      supabase={supabase}
                      sujeto={sujeto}
                      onPicked={onPickedTitular}
                      onClear={() => {
                        setTitular(null);
                        setTitularNombre("—");
                        setPoblacion(null);
                        setRuta(null);
                      }}
                    />
                    <div className="text-[12px] text-muted mt-1">
                      {titular ? `Seleccionado: ${titular.nombre}` : "—"}
                    </div>
                  </label>

                  <label className="block">
                    <div className="text-[12px] text-gray-600 mb-1">Población</div>
                    <input className="input" value={poblacion?.nombre ?? "—"} readOnly />
                  </label>

                  <label className="block">
                    <div className="text-[12px] text-gray-600 mb-1">Ruta</div>
                    <input className="input" value={ruta?.nombre ?? "—"} readOnly />
                  </label>
                </div>

                <div className="flex justify-end border-t pt-2">
                  <button
                    className="btn-primary btn--sm"
                    onClick={() => setTab("datos")}
                    disabled={!titularOk}
                  >
                    Continuar <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {esRenovacion && renResumen && (
              <>
                <div className={`p-3 border rounded-2 ${renResumen.renovable ? "bg-blue-50" : "bg-amber-50"} flex items-center gap-2 text-[13px]`}>
                  <RefreshCcw className="w-4 h-4" />
                  {renResumen.renovable
                    ? "Este crédito YA es renovable (avance ≥ 10 semanas pagadas)."
                    : "Aún no es renovable. Se habilita cuando el avance sea ≥ 10 semanas pagadas."}
                </div>

                {/* Mostrar titular + geo en solo lectura */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block">
                    <div className="text-[12px] text-gray-600 mb-1">Titular</div>
                    <input className="input" value={titularNombre} readOnly />
                  </label>
                  <label className="block">
                    <div className="text-[12px] text-gray-600 mb-1">Población</div>
                    <input className="input" value={poblacion?.nombre ?? "—"} readOnly />
                  </label>
                  <label className="block">
                    <div className="text-[12px] text-gray-600 mb-1">Ruta</div>
                    <input className="input" value={ruta?.nombre ?? "—"} readOnly />
                  </label>
                </div>
              </>
            )}
          </div>
        ) : tab === "datos" ? (
          <div className="p-4 grid gap-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Semanas</div>
                <select
                  className="input"
                  value={semanas}
                  onChange={(e) => setSemanas(parseInt(e.target.value))}
                >
                  {semanasOptions.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Monto permitido</div>
                <select
                  className="input"
                  value={montoId ?? ""}
                  onChange={(e) => setMontoId(e.target.value ? Number(e.target.value) : null)}
                >
                  {!montos.length && <option value="">—</option>}
                  {montos.map((m) => (
                    <option key={m.id} value={m.id}>{fmtMoney(m.monto)}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Cuota semanal</div>
                <input className="input" value={fmtMoney(cuota)} readOnly />
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Papelería (obligatoria)</div>
                <select
                  className="input"
                  value={papeleriaId ?? ""}
                  onChange={(e) => setPapeleriaId(e.target.value ? Number(e.target.value) : null)}
                >
                  {!papelerias.length && <option value="">—</option>}
                  {papelerias.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Fecha de disposición</div>
                <input
                  className="input"
                  type="date"
                  value={fechaDisp}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFechaDisp(v);
                    if (primerPago && primerPago < v) setPrimerPago(v);
                  }}
                />
              </label>

              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Primer pago</div>
                <input
                  className="input"
                  type="date"
                  min={fechaDisp}
                  value={primerPago || primerPagoSugerido}
                  onChange={(e) => setPrimerPago(e.target.value)}
                />
                {primerPago && primerPago < fechaDisp && (
                  <div className="text-[12px] text-red-700 mt-1">
                    El primer pago debe ser el mismo día o después de la disposición.
                  </div>
                )}
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Folio</div>
                <select
                  className="input"
                  value={folioMode}
                  onChange={(e) => setFolioMode(e.target.value as any)}
                  disabled={esRenovacion}
                >
                  <option value="AUTO">Folio automático</option>
                  <option value="MANUAL">Folio manual</option>
                </select>
              </label>
              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Valor</div>
                <input
                  className="input"
                  value={folioExterno}
                  onChange={(e) => {
                    setFolioExterno(e.target.value);
                    setFolioOk(null);
                  }}
                  onBlur={() => {
                    if (folioMode === "MANUAL" && !esRenovacion) checkFolio();
                  }}
                  disabled={folioMode === "AUTO" || esRenovacion}
                />
                {folioMode === "MANUAL" && folioOk === false && (
                  <div className="text-[12px] text-red-700 mt-1">Ese folio ya existe.</div>
                )}
                {folioMode === "MANUAL" && checkingFolio && (
                  <div className="text-[12px] text-muted mt-1">Validando…</div>
                )}
              </label>
            </div>

            {!fechasOk && (
              <div className="alert alert--error mt-1">
                La fecha del primer pago debe ser el mismo día o posterior a la fecha de disposición.
              </div>
            )}

            <div className="flex justify-between border-t pt-2">
              <button className="btn-outline btn--sm" onClick={() => setTab("titular")}>
                <ChevronLeft className="w-4 h-4" /> Volver
              </button>
              <button
                className="btn-primary btn--sm"
                onClick={() => setTab("resumen")}
                disabled={!datosOk}
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="card p-3">
                <div className="text-[12px] text-muted">Operación</div>
                <div className="text-[13px] font-medium">
                  {esRenovacion ? "Renovación" : "Alta nueva"}
                </div>

                <div className="mt-2 text-[12px] text-muted">Folio</div>
                <div className="text-[13px] font-medium">{folioExterno || "—"}</div>

                <div className="mt-2 text-[12px] text-muted">Semanas</div>
                <div className="text-[13px] font-medium">{semanas}</div>

                <div className="mt-2 text-[12px] text-muted">Monto</div>
                <div className="text-[13px] font-medium">{fmtMoney(monto)}</div>

                <div className="mt-2 text-[12px] text-muted">Cuota semanal</div>
                <div className="text-[13px] font-medium">{fmtMoney(cuota)}</div>

                <div className="mt-2 text-[12px] text-muted">Papelería</div>
                <div className="text-[13px] font-medium">{fmtMoney(papMonto)}</div>

                <div className="mt-2 text-[12px] text-muted">Fecha de disposición</div>
                <div className="text-[13px] font-medium">{fechaDisp}</div>

                <div className="mt-2 text-[12px] text-muted">Primer pago</div>
                <div className="text-[13px] font-medium">{primerPagoEfectivo}</div>
              </div>

              <div className="card p-3">
                <div className="text-[12px] text-muted">Desglose (renovación)</div>
                <div className="text-[13px]">
                  <div className="flex justify-between">
                    <span>Cuotas pendientes (no vencidas)</span>
                    <span>{fmtMoney((renResumen as any)?.pendienteNoVencido ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cartera vencida</span>
                    <span>{fmtMoney(renResumen?.carteraVencida ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>M15 activa</span>
                    <span>{fmtMoney(renResumen?.multaM15Activa ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Papelería</span>
                    <span>{fmtMoney(papMonto)}</span>
                  </div>

                  {(renResumen as any)?.descuentoExtra > 0 && (
                    <div className="flex justify-between">
                      <span>Descuento extra</span>
                      <span>{fmtMoney((renResumen as any)?.descuentoExtra ?? 0)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-2 border-t pt-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted">Total descuentos</span>
                    <span className="font-medium">
                      {fmtMoney(totalDescuentos)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 border-t pt-2 text-[13px] font-semibold flex justify-between">
                  <span>Neto a entregar</span>
                  <span>{fmtMoney(netoAEntregar)}</span>
                </div>
              </div>
            </div>

            <div className="px-1 pt-2 border-t flex items-center justify-between">
              <button className="btn-outline btn--sm" onClick={() => setTab("datos")}>
                <ChevronLeft className="w-4 h-4" /> Volver a datos
              </button>
              <button
                className="btn-primary btn--sm"
                onClick={crearCredito}
                disabled={esRenovacion && !renResumen?.renovable}
                title={esRenovacion && !renResumen?.renovable ? "Aún no es renovable (avance < 10 semanas pagadas)" : undefined}
              >
                <Save className="w-4 h-4" /> {esRenovacion ? "Renovar" : "Crear crédito"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
