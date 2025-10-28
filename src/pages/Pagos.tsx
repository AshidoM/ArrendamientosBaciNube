// src/pages/Pagos.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Save,
  AlertTriangle,
  Pencil,
  Trash2,
  RotateCcw,
  ShieldAlert,
  RefreshCcw,
  X,
  Info,
  Lock,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import useConfirm from "../components/Confirm";
import CreditoWizard from "../components/CreditoWizard";
import {
  findCreditoPagable,
  getCuotas,
  getPagos,
  simularAplicacion,
  registrarPago,
  recalcularCredito,
  editarPagoNota,
  eliminarPago,
  marcarCuotaVencida,
  getCreditoById,
  type CreditoPagable,
  type CuotaRow,
  type PagoRow,
  type TipoPago,
  money,
  titularDe,
} from "../services/pagos.service";
import {
  listMultasByCredito,
  activarMulta,
  desactivarMulta,
  eliminarMulta,
  type Multa,
} from "../services/multas.service";
import { supabase } from "../lib/supabase";

// [AUTHZ]
import {
  getMyAssignedPopulationIds,
  getMyAssignedRouteIds,
} from "../lib/authz";

type Tab = "cuotas" | "pagos" | "multas";

export default function Pagos() {
  const location = useLocation();

  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const [cred, setCred] = useState<CreditoPagable | null>(null);
  const [cuotas, setCuotas] = useState<CuotaRow[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [multas, setMultas] = useState<Multa[]>([]);
  const [tab, setTab] = useState<Tab>("cuotas");
  const [err, setErr] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoPago>("CUOTA");
  const [monto, setMonto] = useState<number>(0);
  const [nota, setNota] = useState<string>("");

  const [saving, setSaving] = useState(false);

  const cuota = useMemo(() => Number(cred?.cuota ?? 0), [cred]);

  const [simulando, setSimulando] = useState(false);
  const [simu, setSimu] = useState<{ num_semana: number; aplica: number; saldo_semana: number }[]>([]);

  const [editPago, setEditPago] = useState<PagoRow | null>(null);
  const [editNota, setEditNota] = useState<string>("");

  // Wizard Renovación
  const [openWizard, setOpenWizard] = useState(false);

  const [confirm, ConfirmUI] = useConfirm();

  // ======== detección de finalización ========
  const finalizado = (cred?.estado || "").toUpperCase() === "FINALIZADO";
  const [finalizadoMotivo, setFinalizadoMotivo] = useState<"RENOVACION" | "LIQUIDADO" | null>(null);

  // [AUTHZ] asignaciones del capturista
  const [myPopIds, setMyPopIds] = useState<number[]>([]);
  const [myRouteIds, setMyRouteIds] = useState<number[]>([]);
  const pertenece = useMemo(() => {
    if (!cred) return true; // sin crédito, no bloqueamos la UI
    const pid = Number((cred as any).poblacion_id ?? NaN);
    const rid = Number((cred as any).ruta_id ?? NaN);
    const okPop = Number.isFinite(pid) && myPopIds.includes(pid);
    const okRoute = Number.isFinite(rid) && myRouteIds.includes(rid);
    return okPop || okRoute;
  }, [cred, myPopIds, myRouteIds]);

  // ======== métricas “en vivo” ========
  const carteraVencidaLive = useMemo(() => {
    return cuotas
      .filter((q) => q.estado === "VENCIDA")
      .reduce((s, q) => s + Number(q.debe || 0), 0);
  }, [cuotas]);

  const hasM15Activa = useMemo(() => multas.some((m) => m.activa), [multas]);

  const avanceLabel = useMemo(() => {
    if (!cuotas.length) return "—";
    const pag = cuotas.filter((q) => q.estado === "PAGADA").length;
    const tot = Math.max(...cuotas.map((q) => q.num_semana));
    return `${pag} de ${tot}`;
  }, [cuotas]);

  const pagadas = useMemo(() => cuotas.filter((q) => q.estado === "PAGADA").length, [cuotas]);
  const renovable = useMemo(() => pagadas >= 10 && !finalizado, [pagadas, finalizado]);

  const totalVencidas = useMemo(
    () => cuotas.filter((q) => q.estado === "VENCIDA").reduce((s, q) => s + Number(q.debe || 0), 0),
    [cuotas]
  );
  const nextPendiente = useMemo(() => cuotas.find((q) => q.estado !== "PAGADA") || null, [cuotas]);
  const sugerenciaMonto = useMemo(
    () => (nextPendiente ? totalVencidas + (cred ? Number(cred.cuota) : 0) : totalVencidas),
    [totalVencidas, nextPendiente, cred]
  );

  function resetPagoPanel(c: CreditoPagable | null) {
    if (!c) return;
    const hasVenc = carteraVencidaLive > 0;
    setTipo(hasVenc ? "VENCIDA" : "CUOTA");
    setMonto(hasVenc ? Math.max(carteraVencidaLive, 0) : Number(c.cuota || 0));
    setNota("");
    setSimu([]);
  }

  async function detectMotivoFinalizado(creditoId: number) {
    const { data, error } = await supabase
      .from("creditos")
      .select("id")
      .eq("renovado_de_id", creditoId)
      .limit(1);
    if (!error && data && data.length > 0) {
      setFinalizadoMotivo("RENOVACION");
    } else {
      setFinalizadoMotivo("LIQUIDADO");
    }
  }

  async function loadCredito(c: CreditoPagable) {
    setCred(c);
    const [cc, pg, mu] = await Promise.all([getCuotas(c.id), getPagos(c.id), listMultasByCredito(c.id)]);
    setCuotas(cc);
    setPagos(pg);
    setMultas(mu);
    if ((c.estado || "").toUpperCase() === "FINALIZADO") {
      await detectMotivoFinalizado(c.id);
    } else {
      setFinalizadoMotivo(null);
    }

    const hasVenc = cc.some((q) => q.estado === "VENCIDA" && q.debe > 0);
    setTipo(hasVenc ? "VENCIDA" : "CUOTA");
    setMonto(
      hasVenc
        ? Math.max(
            cc.reduce((s, q) => s + (q.estado === "VENCIDA" ? Number(q.debe || 0) : 0), 0),
            0
          )
        : Number(c.cuota || 0)
    );
    setNota("");
    setSimu([]);
  }

  async function loadCreditoById(id: number) {
    const c = await getCreditoById(id);
    if (!c) return;
    await loadCredito(c);
  }

  // [AUTHZ] cargar asignaciones del capturista
  useEffect(() => {
    (async () => {
      const [p, r] = await Promise.all([
        getMyAssignedPopulationIds(true),
        getMyAssignedRouteIds(true),
      ]);
      setMyPopIds(p);
      setMyRouteIds(r);
    })();
  }, []);

  // ================= Buscar manual =================
  async function doSearch() {
    setErr(null);
    setLoading(true);
    try {
      const c = await findCreditoPagable(term);
      setCuotas([]);
      setPagos([]);
      setMultas([]);
      if (!c) {
        setCred(null);
        setErr("No se encontró un crédito con ese criterio.");
        return;
      }
      await loadCredito(c);
    } catch (e: any) {
      setErr(e.message || "Error al buscar.");
    } finally {
      setLoading(false);
    }
  }

  // ================= Autocargar por ?creditoId= =================
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const cid = sp.get("creditoId");
    if (!cid) return;
    const id = Number(cid);
    if (!Number.isFinite(id)) return;

    (async () => {
      try {
        setErr(null);
        setLoading(true);
        await loadCreditoById(id);
      } catch (e: any) {
        setErr(e.message || "No se pudo cargar el crédito.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (!cred) return;
    const hasVenc = carteraVencidaLive > 0;
    setTipo(hasVenc ? "VENCIDA" : "CUOTA");
    setMonto(hasVenc ? Math.max(carteraVencidaLive, 0) : Number(cred.cuota || 0));
    setSimu([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carteraVencidaLive, cuota]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!cred) {
        setSimu([]);
        return;
      }
      const m = Number(monto);
      if (!Number.isFinite(m) || m <= 0) {
        setSimu([]);
        return;
      }
      setSimulando(true);
      try {
        const res = await simularAplicacion(cred.id, m);
        if (!alive) return;
        setSimu(
          res.map((r) => ({
            num_semana: r.num_semana,
            aplica: Number(r.aplica),
            saldo_semana: Number(r.saldo_semana),
          }))
        );
      } catch {
        if (alive) setSimu([]);
      } finally {
        if (alive) setSimulando(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [monto, cred]);

  async function refreshCredito() {
    if (!cred) return;
    const [freshCred, cc, pg, mu] = await Promise.all([
      getCreditoById(cred.id),
      getCuotas(cred.id),
      getPagos(cred.id),
      listMultasByCredito(cred.id),
    ]);
    if (freshCred) setCred(freshCred);
    setCuotas(cc);
    setPagos(pg);
    setMultas(mu);
    if ((freshCred?.estado || "").toUpperCase() === "FINALIZADO") {
      await detectMotivoFinalizado(cred.id);
    } else {
      setFinalizadoMotivo(null);
    }
  }

  // ================= acciones =================
  async function onRegistrarPago() {
    if (!cred || saving || finalizado || !pertenece) return;
    if (cuotas.length === 0) {
      await confirm({ tone: "warn", title: "Sin cuotas", message: "Genera las cuotas primero." });
      return;
    }

    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) {
      await confirm({ tone: "warn", title: "Monto inválido", message: "Indica un monto válido." });
      return;
    }

    if (carteraVencidaLive > 0 && tipo !== "VENCIDA") {
      await confirm({
        tone: "warn",
        title: "Hay vencidos",
        message: "Cuando existe cartera vencida, debes usar 'Cuota vencida'.",
      });
      return;
    }

    const warnAnticipado = tipo !== "VENCIDA" && simu.length > 0 && (simu[0]?.num_semana ?? 1) > 1;
    if (warnAnticipado) {
      const ok = await confirm({
        tone: "warn",
        title: "Pago adelantado",
        message: `Estás pagando semanas por adelantado (siguiente: #${simu[0].num_semana}). ¿Continuar?`,
        confirmText: "Sí, continuar",
      });
      if (!ok) return;
    }

    try {
      setSaving(true);
      const res = await registrarPago(cred.id, m, tipo, nota || undefined);
      await refreshCredito();
      setNota("");
      await confirm({
        title: "Pago registrado",
        message: `Restante no aplicado: ${money(res.restante_no_aplicado)}`,
      });
    } catch (e: any) {
      await confirm({ tone: "danger", title: "Error", message: e.message || "Error al registrar pago." });
    } finally {
      setSaving(false);
    }
  }

  async function onMarcarVencida() {
    if (!cred || finalizado || !pertenece) return;
    try {
      const r = await marcarCuotaVencida(cred.id);
      if (!r.ok) {
        await confirm({
          tone: "warn",
          title: "Sin cambio",
          message: r.msg ?? "No hay semanas con saldo para marcar.",
        });
        return;
      }
      await refreshCredito();
      await confirm({
        title: "Cuota marcada VENCIDA",
        message: `Semana #${r.semana} marcada como VENCIDA.`,
      });
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "Error",
        message: e.message || "No se pudo marcar la cuota como vencida.",
      });
    }
  }

  function startEditPago(p: PagoRow) {
    if (finalizado || !pertenece) return;
    setEditPago(p);
    setEditNota(p.nota ?? "");
  }
  async function saveEditPago() {
    if (!editPago) return;
    try {
      await editarPagoNota(editPago.id, editNota || null);
      setEditPago(null);
      await refreshCredito();
      await confirm({ title: "Nota actualizada" });
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "Error",
        message: e.message || "No se pudo actualizar la nota.",
      });
    }
  }

  async function onEliminarPago(p: PagoRow) {
    if (finalizado || !pertenece) return;
    const ok = await confirm({
      tone: "danger",
      title: "Eliminar pago",
      message: `Vas a eliminar el pago #${p.id} por ${money(p.monto)} (${p.tipo}). Se revertirá su aplicación y se re-aplicarán los demás pagos. ¿Continuar?`,
      confirmText: "Eliminar",
    });
    if (!ok) return;
    try {
      await eliminarPago(p.id);
      await recalcularCredito(cred!.id);
      await refreshCredito();
      await confirm({ title: "Pago eliminado", message: "Aplicaciones revertidas y estados recalculados." });
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "Error",
        message: e.message || "No se pudo eliminar el pago.",
      });
    }
  }

  const bloqueoMsg =
    !pertenece
      ? "Este crédito no pertenece a ninguna de tus poblaciones/rutas asignadas. El panel es solo lectura."
      : finalizadoMotivo === "RENOVACION"
      ? "Este crédito fue finalizado por renovación. El panel es solo de lectura."
      : finalizadoMotivo === "LIQUIDADO"
      ? "Este crédito está liquidado y finalizado. El panel es solo de lectura."
      : finalizado
      ? "Este crédito está finalizado. El panel es solo de lectura."
      : "";

  return (
    <div className="dt__card">
      {ConfirmUI}

      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="dt__search--sm">
            <input
              className="input"
              placeholder="Buscar (folio externo, CR-#, nombre)"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSearch();
              }}
            />
          </div>
          <div className="self-end">
            <button className="btn-primary btn--sm" onClick={doSearch} disabled={loading}>
              <Search className="w-4 h-4" /> Buscar
            </button>
          </div>
          <div />
        </div>
      </div>

      {!!err && (
        <div className="px-3">
          <div className="alert alert--error flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <div className="flex-1">{err}</div>
            <div className="flex gap-2">
              {cred && (
                <button
                  className="btn-outline btn--sm"
                  onClick={async () => {
                    await recalcularCredito(cred.id);
                    await refreshCredito();
                  }}
                  disabled={finalizado || !pertenece}
                  title={!pertenece ? "Crédito fuera de tus asignaciones" : finalizado ? "Crédito finalizado" : undefined}
                >
                  <RotateCcw className="w-4 h-4" /> Re-aplicar pagos
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {cred ? (
        <div className="p-3 grid lg:grid-cols-2 gap-3">
          {/* Resumen */}
          <div className="card p-3 grid gap-2">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold">
                Crédito: {cred.folio_publico ?? cred.folio_externo ?? `CR-${cred.id}`}
              </div>

              <button
                className={`btn--sm ${
                  renovable && pertenece ? "btn-primary" : "btn-outline text-gray-500"
                }`}
                title={
                  !pertenece
                    ? "Crédito fuera de tus asignaciones"
                    : finalizado
                    ? "Crédito finalizado (no renovable)"
                    : renovable
                    ? "Renovar crédito"
                    : "Disponible con 10 semanas pagadas"
                }
                disabled={!renovable || !pertenece}
                onClick={() => setOpenWizard(true)}
              >
                <RefreshCcw className="w-4 h-4" /> Renovar
              </button>
            </div>

            {(finalizado || !pertenece) && (
              <div className="p-2 rounded-2 border bg-amber-50 text-amber-900 flex items-center gap-2 text-[13px]">
                <Info className="w-4 h-4" />
                <div>{bloqueoMsg}</div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-2 text-[13px]">
              <div>
                <div className="text-muted text-[12px]">Titular</div>
                <div>{titularDe(cred)}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">Sujeto</div>
                <div>{cred.sujeto}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">Monto total</div>
                <div>{money(cred.monto_total)}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">Cuota semanal</div>
                <div>{money(cred.cuota)}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">Adeudo total</div>
                <div>{money(cred.adeudo_total)}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">Cartera vencida</div>
                <div className={carteraVencidaLive > 0 ? "text-red-700" : ""}>
                  {money(carteraVencidaLive)}
                </div>
              </div>
              <div>
                <div className="text-muted text-[12px]">Avance</div>
                <div>
                  <span className="badge">{avanceLabel}</span>
                </div>
              </div>
              <div>
                <div className="text-muted text-[12px]">Población / Ruta</div>
                <div>
                  #{(cred as any).poblacion_id ?? "—"} / #{(cred as any).ruta_id ?? "—"}{" "}
                  {!pertenece && <span className="inline-flex items-center gap-1 text-amber-800"><Lock className="w-3 h-3" /> fuera de asignación</span>}
                </div>
              </div>
            </div>

            <div className="mt-2 p-2 rounded-2 border bg-gray-50">
              <div className="text-[12px] text-muted">Sugerencia de cobro</div>
              <div className="text-[13px]">
                {nextPendiente ? (
                  <>
                    Pago semana <b>#{nextPendiente.num_semana}</b>: <b>{money(sugerenciaMonto)}</b>{" "}
                    <span className="text-muted">
                      (vencidas {money(totalVencidas)} + cuota {money(cred.cuota)})
                    </span>
                  </>
                ) : (
                  <>
                    Total vencidas: <b>{money(totalVencidas)}</b>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Pagar */}
          <div className={`card p-3 grid gap-3 ${finalizado || !pertenece ? "opacity-60" : ""}`}>
            <div className="text-[13px] font-semibold">Registrar pago</div>

            <div className="grid grid-cols-3 gap-2 text-[13px]">
              <label
                className={`border rounded-2 p-2 flex gap-2 items-center ${
                  carteraVencidaLive > 0 ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === "CUOTA"}
                  onChange={() => setTipo("CUOTA")}
                  disabled={carteraVencidaLive > 0 || finalizado || !pertenece}
                />
                <div className="flex-1">
                  <div className="font-medium">Cuota semanal</div>
                  <div className="text-[12px] text-muted">{money(cuota)}</div>
                </div>
              </label>

              <label className="border rounded-2 p-2 flex gap-2 items-center">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === "VENCIDA"}
                  onChange={() => setTipo("VENCIDA")}
                  disabled={finalizado || !pertenece}
                />
                <div className="flex-1">
                  <div className="font-medium">Cuota vencida</div>
                  <div className="text-[12px] text-muted">
                    {carteraVencidaLive > 0 ? money(carteraVencidaLive) : "Sin vencidos"}
                  </div>
                </div>
              </label>

              <label
                className={`border rounded-2 p-2 flex gap-2 items-center ${
                  carteraVencidaLive > 0 ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === "ABONO"}
                  onChange={() => setTipo("ABONO")}
                  disabled={carteraVencidaLive > 0 || finalizado || !pertenece}
                />
                <div className="flex-1">
                  <div className="font-medium">Abono</div>
                  <div className="text-[12px] text-muted">Monto libre</div>
                </div>
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-2">
              <label className="block sm:col-span-1">
                <div className="text-[12px] text-muted mb-1">Monto</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(Number(e.target.value || 0))}
                  disabled={finalizado || !pertenece || tipo === "CUOTA" || (tipo === "VENCIDA" && carteraVencidaLive > 0)}
                />
              </label>

              <label className="block sm:col-span-2">
                <div className="text-[12px] text-muted mb-1">Nota (opcional)</div>
                <input
                  className="input"
                  placeholder="Observaciones del pago…"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  disabled={finalizado || !pertenece}
                />
              </label>
            </div>

            {/* Simulador */}
            <div className="border rounded-2 p-2">
              <div className="text-[12.5px] font-medium mb-1">Simulación</div>
              {simulando ? (
                <div className="text-[12.5px] text-muted">Calculando…</div>
              ) : simu.length === 0 ? (
                <div className="text-[12.5px] text-muted">Indica un monto para ver cómo se aplicará.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left text-[12px] text-muted">Semana</th>
                        <th className="text-right text-[12px] text-muted">Aplica</th>
                        <th className="text-right text-[12px] text-muted">Saldo semana</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simu.map((s) => (
                        <tr key={s.num_semana}>
                          <td className="text-[13px] py-1">#{s.num_semana}</td>
                          <td className="text-[13px] py-1 text-right">{money(s.aplica)}</td>
                          <td className="text-[13px] py-1 text-right">{money(s.saldo_semana)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                className="btn-outline btn--sm"
                onClick={onMarcarVencida}
                disabled={finalizado || !pertenece}
                title={!pertenece ? "Crédito fuera de tus asignaciones" : finalizado ? "Crédito finalizado" : undefined}
              >
                <ShieldAlert className="w-4 h-4" /> Cuota a vencida
              </button>
              <button
                className="btn-primary btn--sm"
                onClick={onRegistrarPago}
                disabled={finalizado || !pertenece || cuotas.length === 0 || saving}
                title={!pertenece ? "Crédito fuera de tus asignaciones" : finalizado ? "Crédito finalizado" : undefined}
              >
                <Save className="w-4 h-4" /> {saving ? "Guardando…" : "Registrar pago"}
              </button>
            </div>
          </div>

          {/* Historial */}
          <div className="lg:col-span-2">
            <div className="flex gap-2 border-b">
              <button
                className={`btn-ghost !h-8 !px-3 text-xs ${tab === "cuotas" ? "nav-active" : ""}`}
                onClick={() => setTab("cuotas")}
              >
                Cuotas
              </button>
              <button
                className={`btn-ghost !h-8 !px-3 text-xs ${tab === "pagos" ? "nav-active" : ""}`}
                onClick={() => setTab("pagos")}
              >
                Pagos realizados
              </button>
              <button
                className={`btn-ghost !h-8 !px-3 text-xs ${tab === "multas" ? "nav-active" : ""}`}
                onClick={() => setTab("multas")}
              >
                Multas
              </button>
            </div>

            {tab === "cuotas" ? (
              <div className="table-frame overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Semana</th>
                      <th>Fecha</th>
                      <th className="text-right">Programado</th>
                      <th className="text-right">Abonado</th>
                      <th className="text-right">Debe</th>
                      <th className="text-center">M15</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuotas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-[13px] text-muted py-4">
                          Sin cuotas.
                        </td>
                      </tr>
                    ) : (
                      cuotas.map((c) => (
                        <tr key={c.id}>
                          <td className="text-[13px] text-center">#{c.num_semana}</td>
                          <td className="text-[13px] text-center">{c.fecha_programada}</td>
                          <td className="text-[13px] text-right">{money(c.monto_programado)}</td>
                          <td className="text-[13px] text-right">{money(c.abonado)}</td>
                          <td className="text-[13px] text-right">{money(c.debe)}</td>
                          <td className="text-[13px] text-center">
                            {c.m15_count > 0 ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-2 text-[11px] ${
                                  c.m15_activa ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                <ShieldAlert className="w-3 h-3" /> M15
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="text-[13px]">
                            {c.estado === "PAGADA" ? (
                              <span className="text-green-700 font-medium">PAGADA</span>
                            ) : c.estado === "VENCIDA" ? (
                              <span className="text-red-700 font-medium">VENCIDA</span>
                            ) : c.estado === "PARCIAL" ? (
                              <span className="text-amber-700 font-medium">PARCIAL</span>
                            ) : (
                              <span className="text-gray-600">PENDIENTE</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : tab === "pagos" ? (
              <div className="table-frame overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th className="text-right">Monto</th>
                      <th>Nota</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-[13px] text-muted py-4">
                          Sin pagos registrados.
                        </td>
                      </tr>
                    ) : (
                      pagos.map((p) => (
                        <tr key={p.id}>
                          <td className="text-[13px]">{new Date(p.fecha).toLocaleString()}</td>
                          <td className="text-[13px]">{p.tipo}</td>
                          <td className="text-[13px] text-right">{money(p.monto)}</td>
                          <td className="text-[13px]">{p.nota ?? "—"}</td>
                          <td className="text-center">
                            <div className="inline-flex gap-2">
                              <button
                                className="btn-outline btn--sm"
                                onClick={() => startEditPago(p)}
                                disabled={finalizado || !pertenece}
                                title={!pertenece ? "Crédito fuera de tus asignaciones" : finalizado ? "Crédito finalizado" : undefined}
                              >
                                <Pencil className="w-4 h-4" /> Editar
                              </button>
                              <button
                                className="btn-outline btn--sm"
                                onClick={() => onEliminarPago(p)}
                                disabled={finalizado || !pertenece}
                                title={!pertenece ? "Crédito fuera de tus asignaciones" : finalizado ? "Crédito finalizado" : undefined}
                              >
                                <Trash2 className="w-4 h-4" /> Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-frame overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Creación</th>
                      <th>Semana</th>
                      <th>Activa</th>
                      <th>Estado</th>
                      <th className="text-right">Monto</th>
                      <th className="text-right">Pagado</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-[13px] text-muted py-4">
                          Sin multas.
                        </td>
                      </tr>
                    ) : (
                      multas.map((m) => (
                        <tr key={m.id}>
                          <td className="text-[13px]">{new Date(m.fecha_creacion).toLocaleString()}</td>
                          <td className="text-[13px] text-center">#{m.semana ?? "—"}</td>
                          <td className="text-[13px] text-center">{m.activa ? "Sí" : "No"}</td>
                          <td className="text-[13px]">{m.estado}</td>
                          <td className="text-[13px] text-right">{money(m.monto)}</td>
                          <td className="text-[13px] text-right">{money(m.monto_pagado)}</td>
                          <td className="text-center">
                            <div className="inline-flex gap-2">
                              <button
                                className="btn-outline btn--sm"
                                onClick={async () => {
                                  if (finalizado || !pertenece) return;
                                  m.activa ? await desactivarMulta(m.id) : await activarMulta(m.id);
                                  await refreshCredito();
                                }}
                                disabled={finalizado || !pertenece}
                                title={!pertenece ? "Crédito fuera de tus asignaciones" : finalizado ? "Crédito finalizado" : undefined}
                              >
                                {m.activa ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                className="btn-outline btn--sm"
                                onClick={async () => {
                                  if (finalizado || !pertenece) return;
                                  if (
                                    await confirm({
                                      tone: "danger",
                                      title: "Eliminar multa",
                                      message: `¿Eliminar la multa #${m.id}?`,
                                      confirmText: "Eliminar",
                                    })
                                  ) {
                                    await eliminarMulta(m.id);
                                    await refreshCredito();
                                  }
                                }}
                                disabled={finalizado || !pertenece}
                                title={!pertenece ? "Crédito fuera de tus asignaciones" : finalizado ? "Crédito finalizado" : undefined}
                              >
                                <Trash2 className="w-4 h-4" /> Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 text-[13px] text-muted">
          Busca un crédito por <b>folio externo</b>, <b>CR-#</b> o <b>nombre</b> para ver su resumen, registrar
          pagos, marcar vencidas y gestionar M15.
        </div>
      )}

      {/* Modal editar nota */}
      {editPago && (
        <div className="modal">
          <div className="modal-card modal-card-sm">
            <div className="modal-head">
              <div className="text-[13px] font-medium">Editar nota del pago #{editPago.id}</div>
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setEditPago(null)}>
                <X className="w-4 h-4" /> Cerrar
              </button>
            </div>
            <div className="p-3 grid gap-2">
              <div className="text-[12.5px]">
                Monto: <b>{money(editPago.monto)}</b> — Tipo: <b>{editPago.tipo}</b>
              </div>
              <label className="block">
                <div className="text-[12px] text-muted mb-1">Nota</div>
                <input
                  className="input"
                  value={editNota}
                  onChange={(e) => setEditNota(e.target.value)}
                  disabled={finalizado || !pertenece}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button className="btn-outline btn--sm" onClick={() => setEditPago(null)}>
                  Cancelar
                </button>
                <button className="btn-primary btn--sm" onClick={saveEditPago} disabled={finalizado || !pertenece}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wizard (renovación / alta) */}
      {openWizard && cred && (
        <CreditoWizard
          open={openWizard}
          renovacionOrigen={{ creditoId: cred.id }}
          onClose={() => setOpenWizard(false)}
          onCreated={async () => {
            setOpenWizard(false);
            await refreshCredito();
          }}
        />
      )}
    </div>
  );
}
