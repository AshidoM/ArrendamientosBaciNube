// src/pages/Pagos.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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
  getTitularNombre,
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

/**
 * Partidas de pago (detalle por cuota/multa).
 * Las usamos SOLO en el Front para calcular el estado real (PAGADA vs ABONADO)
 * según la fecha del último pago aplicado a cada cuota.
 */
type PartidaRow = {
  id: number;
  pago_id: number;
  tipo: TipoPago;
  cuota_id: number | null;
  multa_id: number | null;
  monto: number;
  aplica: number | null;
};

/**
 * Estado visual de la cuota según tus reglas:
 * - VENCIDA: cuando se marca manualmente en BD.
 * - PAGADA: se cubrió completo Y la última fecha de pago fue <= fecha_programada.
 * - ABONADO: tiene pagos pero quedó parcial, o se cubrió completo pero tarde.
 * - PENDIENTE: no tiene pagos (y no está marcada VENCIDA).
 */
type EstadoCuotaUi = "PENDIENTE" | "PAGADA" | "VENCIDA" | "ABONADO";

/**
 * Cuota calculada para la UI: arrastre + total pago + estadoUi.
 */
type CuotaCalculada = CuotaRow & {
  arrastreAnterior: number;
  totalSemana: number;
  estadoUi: EstadoCuotaUi;
};

function toLocalDateTimeInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export default function Pagos() {
  const location = useLocation();

  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const [cred, setCred] = useState<CreditoPagable | null>(null);
  const [cuotas, setCuotas] = useState<CuotaRow[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [multas, setMultas] = useState<Multa[]>([]);
  const [partidas, setPartidas] = useState<PartidaRow[]>([]);
  const [tab, setTab] = useState<Tab>("cuotas");
  const [err, setErr] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoPago>("CUOTA");
  const [monto, setMonto] = useState<number>(0);
  const [nota, setNota] = useState<string>("");

  // Semanas vencidas a cubrir (solo tipo VENCIDA)
  const [semanasVencidas, setSemanasVencidas] = useState<number | "">("");

  // Fecha de pago
  const [fechaPago, setFechaPago] = useState<string>(
    toLocalDateTimeInputValue(new Date())
  );

  const [saving, setSaving] = useState(false);

  const cuota = useMemo(() => Number(cred?.cuota ?? 0), [cred]);

  const [simulando, setSimulando] = useState(false);
  const [simu, setSimu] = useState<
    { num_semana: number; aplica: number; saldo_semana: number }[]
  >([]);

  const [editPago, setEditPago] = useState<PagoRow | null>(null);
  const [editNota, setEditNota] = useState<string>("");

  // Wizard Renovación
  const [openWizard, setOpenWizard] = useState(false);

  const [confirm, ConfirmUI] = useConfirm();

  // ======== detección de finalización ========
  const finalizado = (cred?.estado || "").toUpperCase() === "FINALIZADO";
  const [finalizadoMotivo, setFinalizadoMotivo] = useState<
    "RENOVACION" | "LIQUIDADO" | null
  >(null);

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

  // ======== cálculo de cuotas con arrastre + estadoUi ========
  const cuotasCalculadas: CuotaCalculada[] = useMemo(() => {
    if (!cuotas.length) return [];

    // Map de pago_id -> fecha (Date)
    const fechaPorPagoId = new Map<number, Date>();
    for (const p of pagos) {
      try {
        fechaPorPagoId.set(p.id, new Date(p.fecha));
      } catch {
        // ignore parse errors
      }
    }

    // Para cada cuota, acumulamos:
    // - sumaAplica: total aplicado (aplica o monto)
    // - maxFecha: última fecha en que recibió algo
    const porCuota = new Map<
      number,
      { sumaAplica: number; maxFecha: Date | null }
    >();

    for (const pp of partidas) {
      if (!pp.cuota_id) continue;
      const fecha = fechaPorPagoId.get(pp.pago_id);
      if (!fecha) continue;

      const aplicaNum = Number(
        pp.aplica ?? (pp.monto ?? 0)
      );

      const current =
        porCuota.get(pp.cuota_id) ?? {
          sumaAplica: 0,
          maxFecha: null as Date | null,
        };

      current.sumaAplica += aplicaNum;
      if (!current.maxFecha || fecha > current.maxFecha) {
        current.maxFecha = fecha;
      }
      porCuota.set(pp.cuota_id, current);
    }

    let arrastre = 0;

    return cuotas.map<CuotaCalculada>((c) => {
      const info = porCuota.get(c.id) ?? {
        sumaAplica: Number(c.abonado ?? 0),
        maxFecha: null as Date | null,
      };

      const sumaAplica = info.sumaAplica;
      const maxFecha = info.maxFecha;
      const fechaProg = new Date(c.fecha_programada as any);

      let estadoUi: EstadoCuotaUi;

      const estadoOriginal = String(c.estado || "").toUpperCase();
      const debeNum = Number(c.debe || 0);

      // 1) Si en BD está VENCIDA, respetamos eso (se marca manualmente).
      if (estadoOriginal === "VENCIDA") {
        estadoUi = "VENCIDA";
      } else if (sumaAplica <= 0) {
        // 2) No tiene pagos → PENDIENTE
        estadoUi = "PENDIENTE";
      } else if (debeNum > 0) {
        // 3) Tiene pagos pero sigue debiendo → ABONADO (parcial)
        estadoUi = "ABONADO";
      } else {
        // 4) No debe nada y tiene pagos → depende de la fecha del último pago
        if (maxFecha && maxFecha.getTime() > fechaProg.getTime()) {
          // Pagó fuera de tiempo → se queda como ABONADO (aunque ya no deba nada)
          estadoUi = "ABONADO";
        } else {
          // Pagó completo a tiempo → PAGADA
          estadoUi = "PAGADA";
        }
      }

      const arrastreAnterior = arrastre;
      const totalSemana =
        Number(c.monto_programado ?? 0) + arrastreAnterior;
      arrastre += debeNum;

      return {
        ...c,
        arrastreAnterior,
        totalSemana,
        estadoUi,
      };
    });
  }, [cuotas, pagos, partidas]);

  // ======== métricas “en vivo” (usan estadoUi) ========
  const carteraVencidaLive = useMemo(() => {
    return cuotasCalculadas
      .filter((q) => q.estadoUi === "VENCIDA")
      .reduce((s, q) => s + Number(q.debe || 0), 0);
  }, [cuotasCalculadas]);

  const hasM15Activa = useMemo(
    () => multas.some((m) => m.activa),
    [multas]
  );

  const avanceLabel = useMemo(() => {
    if (!cuotasCalculadas.length) return "—";
    const pag = cuotasCalculadas.filter(
      (q) => q.estadoUi === "PAGADA"
    ).length;
    const tot = Math.max(
      ...cuotasCalculadas.map((q) => q.num_semana)
    );
    return `${pag} de ${tot}`;
  }, [cuotasCalculadas]);

  const pagadas = useMemo(
    () =>
      cuotasCalculadas.filter(
        (q) => q.estadoUi === "PAGADA"
      ).length,
    [cuotasCalculadas]
  );

  const renovable = useMemo(
    () => pagadas >= 10 && !finalizado,
    [pagadas, finalizado]
  );

  const totalVencidas = useMemo(
    () =>
      cuotasCalculadas
        .filter((q) => q.estadoUi === "VENCIDA")
        .reduce((s, q) => s + Number(q.debe || 0), 0),
    [cuotasCalculadas]
  );

  const nextPendiente = useMemo(
    () =>
      cuotasCalculadas.find(
        (q) => q.estadoUi !== "PAGADA"
      ) || null,
    [cuotasCalculadas]
  );

  const sugerenciaMonto = useMemo(
    () =>
      nextPendiente
        ? totalVencidas +
          (cred ? Number(cred.cuota) : 0)
        : totalVencidas,
    [totalVencidas, nextPendiente, cred]
  );

  const totalSemanasVencidas = useMemo(
    () =>
      cuotasCalculadas.filter(
        (q) =>
          q.estadoUi === "VENCIDA" &&
          Number(q.debe || 0) > 0
      ).length,
    [cuotasCalculadas]
  );

  // ======== monto total / adeudo total desde cuotas ========
  const montoTotalCalculado = useMemo(() => {
    if (cuotas.length === 0) {
      return Number(cred?.monto_total ?? 0);
    }
    return cuotas.reduce(
      (s, q) => s + Number(q.monto_programado || 0),
      0
    );
  }, [cuotas, cred]);

  const adeudoTotalCalculado = useMemo(() => {
    if (cuotas.length === 0) {
      return Number(cred?.adeudo_total ?? 0);
    }
    return cuotas.reduce(
      (s, q) => s + Number(q.debe || 0),
      0
    );
  }, [cuotas, cred]);

  function resetPagoPanel(c: CreditoPagable | null) {
    if (!c) return;
    const hasVenc = carteraVencidaLive > 0;
    setTipo(hasVenc ? "VENCIDA" : "CUOTA");
    setMonto(
      hasVenc
        ? Math.max(carteraVencidaLive, 0)
        : Number(c.cuota || 0)
    );
    setNota("");
    setSimu([]);
    setFechaPago(toLocalDateTimeInputValue(new Date()));
    setSemanasVencidas("");
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

  // ---------- Snapshot y refresh centralizado ----------
  async function fetchCreditoSnapshot(creditoId: number) {
    const [freshCred, cc, pg, mu, titularNombre] =
      await Promise.all([
        getCreditoById(creditoId),
        getCuotas(creditoId),
        getPagos(creditoId),
        listMultasByCredito(creditoId),
        getTitularNombre(creditoId),
      ]);

    let mergedCred = freshCred;
    if (titularNombre) {
      mergedCred = {
        ...(freshCred ?? ({} as any)),
        titular: titularNombre,
      } as CreditoPagable;
    }

    // Cargamos partidas solo para los pagos de este crédito
    let pt: PartidaRow[] = [];
    if (pg && pg.length > 0) {
      const pagoIds = pg.map((p) => p.id);
      const { data: dataPartidas, error: errPartidas } =
        await supabase
          .from("pago_partidas")
          .select(
            "id, pago_id, tipo, cuota_id, multa_id, monto, aplica"
          )
          .in("pago_id", pagoIds);
      if (errPartidas) {
        throw new Error(errPartidas.message);
      }
      pt = (dataPartidas ?? []) as PartidaRow[];
    }

    return { freshCred: mergedCred, cc, pg, mu, pt };
  }

  async function loadCredito(c: CreditoPagable) {
    setCred(c);
    const snap = await fetchCreditoSnapshot(c.id);
    if (snap.freshCred) setCred(snap.freshCred);
    setCuotas(snap.cc);
    setPagos(snap.pg);
    setMultas(snap.mu);
    setPartidas(snap.pt);
    if ((snap.freshCred?.estado || "").toUpperCase() === "FINALIZADO") {
      await detectMotivoFinalizado(c.id);
    } else {
      setFinalizadoMotivo(null);
    }

    const hasVenc = snap.cc.some(
      (q) => q.estado === "VENCIDA" && Number(q.debe) > 0
    );
    setTipo(hasVenc ? "VENCIDA" : "CUOTA");
    setMonto(
      hasVenc
        ? Math.max(
            snap.cc.reduce(
              (s, q) =>
                s +
                (q.estado === "VENCIDA"
                  ? Number(q.debe || 0)
                  : 0),
              0
            ),
            0
          )
        : Number((snap.freshCred?.cuota ?? c.cuota) || 0)
    );
    setNota("");
    setSimu([]);
    setFechaPago(toLocalDateTimeInputValue(new Date()));
    setSemanasVencidas("");
  }

  async function loadCreditoById(id: number) {
    const c = await getCreditoById(id);
    if (!c) return;
    await loadCredito(c);
  }

  // [AUTHZ] asignaciones del capturista
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
      setPartidas([]);
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

  // auto-ajuste suave cuando cambia cartera vencida o cuota
  useEffect(() => {
    if (!cred) return;
    const hasVenc = carteraVencidaLive > 0;

    setSimu([]);

    setTipo((prev) => {
      // respetamos ABONO manual
      if (prev === "ABONO") return prev;
      if (hasVenc && prev === "CUOTA") return "VENCIDA";
      if (!hasVenc && prev === "VENCIDA") return "CUOTA";
      return prev;
    });

    setMonto((prev) => {
      if (prev > 0) return prev;
      return hasVenc
        ? Math.max(carteraVencidaLive, 0)
        : Number(cred.cuota || 0);
    });

    if (!hasVenc) {
      setSemanasVencidas("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carteraVencidaLive, cuota]);

  // ======== SIMULACIÓN (igual que antes) ========
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

        const clean = (res ?? [])
          .map((r: any) => ({
            num_semana: Number(r.num_semana),
            aplica: Number(r.aplica),
            saldo_semana: Number(r.saldo_semana),
          }))
          .filter(
            (r) => r.aplica > 0 || r.saldo_semana > 0
          )
          .sort((a, b) => a.num_semana - b.num_semana);

        setSimu(clean);
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

  // ---------- refreshCredito ----------
  async function refreshCredito() {
    if (!cred)
      return {
        cc: [] as CuotaRow[],
        pg: [] as PagoRow[],
        mu: [] as Multa[],
        pt: [] as PartidaRow[],
        freshCred: cred,
      };
    const snap = await fetchCreditoSnapshot(cred.id);
    if (snap.freshCred) setCred(snap.freshCred);
    setCuotas(snap.cc);
    setPagos(snap.pg);
    setMultas(snap.mu);
    setPartidas(snap.pt);
    if ((snap.freshCred?.estado || "").toUpperCase() === "FINALIZADO") {
      await detectMotivoFinalizado(cred.id);
    } else {
      setFinalizadoMotivo(null);
    }
    return snap;
  }

  // ================= Realtime =================
  const refreshTimerRef = useRef<number | null>(null);
  const channelRef =
    useRef<ReturnType<typeof supabase.channel> | null>(null);

  const queueRefresh = async () => {
    if (refreshTimerRef.current != null) return;
    refreshTimerRef.current = window.setTimeout(async () => {
      refreshTimerRef.current = null;
      await refreshCredito();
    }, 250);
  };

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!cred?.id) return;

    const creditoId = cred.id;
    const chan = supabase.channel(
      `pagos-realtime-${creditoId}`
    );

    chan.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pagos",
        filter: "credito_id=eq." + creditoId,
      },
      () => {
        queueRefresh();
      }
    );
    chan.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "creditos_cuotas",
        filter: "credito_id=eq." + creditoId,
      },
      () => {
        queueRefresh();
      }
    );
    chan.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "multas",
        filter: "credito_id=eq." + creditoId,
      },
      () => {
        queueRefresh();
      }
    );

    chan.subscribe();
    channelRef.current = chan;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cred?.id]);

  // ================= acciones =================
  async function onRegistrarPago() {
    if (!cred || saving || finalizado || !pertenece) return;
    if (cuotas.length === 0) {
      await confirm({
        tone: "warn",
        title: "Sin cuotas",
        message: "Genera las cuotas primero.",
      });
      return;
    }

    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) {
      await confirm({
        tone: "warn",
        title: "Monto inválido",
        message: "Indica un monto válido.",
      });
      return;
    }

    // Si hay cartera vencida no permitimos tipo CUOTA simple.
    if (carteraVencidaLive > 0 && tipo === "CUOTA") {
      await confirm({
        tone: "warn",
        title: "Hay vencidos",
        message:
          "Cuando existe cartera vencida, usa 'Cuota vencida' o 'Abono'.",
      });
      return;
    }

    // Fecha válida
    let fecha: Date | null = null;
    try {
      fecha = new Date(fechaPago);
      if (isNaN(fecha.getTime()))
        throw new Error("Fecha inválida");
    } catch {
      await confirm({
        tone: "warn",
        title: "Fecha inválida",
        message: "Selecciona una fecha válida.",
      });
      return;
    }

    const warnAnticipado =
      tipo !== "VENCIDA" &&
      simu.length > 0 &&
      (simu[0]?.num_semana ?? 1) > 1;
    if (warnAnticipado) {
      const ok = await confirm({
        tone: "warn",
        title: "Pago adelantado",
        message: `Estás pagando semanas por adelantado (siguiente: #${simu[0].num_semana}). ¿Continuar?`,
        confirmText: "Sí, continuar",
      });
      if (!ok) return;
    }

    // semanas vencidas a enviar (solo si tipo = VENCIDA)
    let semanasVencidasNum: number | undefined;
    if (tipo === "VENCIDA" && semanasVencidas !== "") {
      const sv = Number(semanasVencidas);
      if (Number.isFinite(sv) && sv > 0) {
        semanasVencidasNum = sv;
      }
    }

    try {
      setSaving(true);
      const res = await registrarPago(
        cred.id,
        m,
        tipo,
        nota || undefined,
        fecha.toISOString(),
        semanasVencidasNum
      );
      await refreshCredito();
      setNota("");
      setFechaPago(toLocalDateTimeInputValue(new Date()));
      setSemanasVencidas("");
      await confirm({
        title: "Pago registrado",
        message: `Restante no aplicado: ${money(
          res.restante_no_aplicado
        )}`,
      });
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "Error",
        message:
          e.message || "Error al registrar pago.",
      });
    } finally {
      setSaving(false);
    }
  }

  // *** marcar vencida con refresh y mensaje de semana detectada ***
  async function onMarcarVencida() {
    if (!cred || finalizado || !pertenece) return;

    const before = cuotasCalculadas.map((q) => ({
      id: q.id,
      num: q.num_semana,
      estado: q.estadoUi,
    }));

    try {
      const r = await marcarCuotaVencida(cred.id);
      const snap = await refreshCredito();
      const after = (snap.cc ?? []).map((q) => ({
        id: q.id,
        num: q.num_semana,
        estado: q.estado,
      }));

      let semanaDetectada: number | null = null;
      for (const a of after) {
        const b = before.find((x) => x.id === a.id);
        if (
          b &&
          b.estado !== "VENCIDA" &&
          String(a.estado).toUpperCase() === "VENCIDA"
        ) {
          semanaDetectada = a.num;
          break;
        }
      }

      if (semanaDetectada != null) {
        await confirm({
          title: "Cuota marcada VENCIDA",
          message: `Semana #${semanaDetectada} marcada como VENCIDA.`,
        });
      } else if ((r as any)?.semana != null) {
        await confirm({
          title: "Cuota marcada VENCIDA",
          message: `Semana #${(r as any).semana} marcada como VENCIDA.`,
        });
      } else if ((r as any)?.ok) {
        await confirm({
          title: "Cuota marcada VENCIDA",
          message: "Se marcó una cuota vencida.",
        });
      } else {
        await confirm({
          tone: "warn",
          title: "Sin cambio",
          message:
            (r as any)?.msg ??
            "No hay semanas con saldo para marcar.",
        });
      }
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "Error",
        message:
          e.message ||
          "No se pudo marcar la cuota como vencida.",
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
      await confirm({
        title: "Nota actualizada",
      });
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "Error",
        message:
          e.message ||
          "No se pudo actualizar la nota.",
      });
    }
  }

  async function onEliminarPago(p: PagoRow) {
    if (finalizado || !pertenece) return;
    const ok = await confirm({
      tone: "danger",
      title: "Eliminar pago",
      message: `Vas a eliminar el pago #${p.id} por ${money(
        p.monto
      )} (${p.tipo}). Se revertirá su aplicación y se re-aplicarán los demás pagos. ¿Continuar?`,
      confirmText: "Eliminar",
    });
    if (!ok) return;
    try {
      await eliminarPago(p.id);
      await recalcularCredito(cred!.id);
      await refreshCredito();
      await confirm({
        title: "Pago eliminado",
        message:
          "Aplicaciones revertidas y estados recalculados.",
      });
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "Error",
        message:
          e.message ||
          "No se pudo eliminar el pago.",
      });
    }
  }

  const bloqueoMsg = !pertenece
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
            <button
              className="btn-primary btn--sm"
              onClick={doSearch}
              disabled={loading}
            >
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
                  title={
                    !pertenece
                      ? "Crédito fuera de tus asignaciones"
                      : finalizado
                      ? "Crédito finalizado"
                      : undefined
                  }
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
                Crédito:{" "}
                {cred.folio_publico ??
                  cred.folio_externo ??
                  `CR-${cred.id}`}
              </div>

              <button
                className={`btn--sm ${
                  renovable && pertenece
                    ? "btn-primary"
                    : "btn-outline text-gray-500"
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
                <div className="text-muted text-[12px]">
                  Titular
                </div>
                <div>{titularDe(cred)}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">
                  Sujeto
                </div>
                <div>{cred.sujeto}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">
                  Monto total
                </div>
                <div>{money(montoTotalCalculado)}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">
                  Cuota semanal
                </div>
                <div>{money(cred.cuota)}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">
                  Adeudo total
                </div>
                <div>{money(adeudoTotalCalculado)}</div>
              </div>
              <div>
                <div className="text-muted text-[12px]">
                  Cartera vencida
                </div>
                <div
                  className={
                    carteraVencidaLive > 0
                      ? "text-red-700"
                      : ""
                  }
                >
                  {money(carteraVencidaLive)}
                </div>
              </div>
              <div>
                <div className="text-muted text-[12px]">
                  Avance
                </div>
                <div>
                  <span className="badge">
                    {avanceLabel}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-muted text-[12px]">
                  Población / Ruta
                </div>
                <div>
                  #{(cred as any).poblacion_id ?? "—"} / #
                  {(cred as any).ruta_id ?? "—"}{" "}
                  {!pertenece && (
                    <span className="inline-flex items-center gap-1 text-amber-800">
                      <Lock className="w-3 h-3" /> fuera de
                      asignación
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-2 p-2 rounded-2 border bg-gray-50">
              <div className="text-[12px] text-muted">
                Sugerencia de cobro
              </div>
              <div className="text-[13px]">
                {nextPendiente ? (
                  <>
                    Pago semana{" "}
                    <b>
                      #
                      {nextPendiente.num_semana}
                    </b>
                    :{" "}
                    <b>
                      {money(sugerenciaMonto)}
                    </b>{" "}
                    <span className="text-muted">
                      (vencidas{" "}
                      {money(totalVencidas)} +
                      cuota {money(cred.cuota)})
                    </span>
                  </>
                ) : (
                  <>
                    Total vencidas:{" "}
                    <b>
                      {money(totalVencidas)}
                    </b>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Pagar */}
          <div
            className={`card p-3 grid gap-3 ${
              finalizado || !pertenece
                ? "opacity-60"
                : ""
            }`}
          >
            <div className="text-[13px] font-semibold">
              Registrar pago
            </div>

            <div className="grid grid-cols-3 gap-2 text-[13px]">
              {/* CUOTA semanal: se bloquea si hay vencidos */}
              <label
                className={`border rounded-2 p-2 flex gap-2 items-center ${
                  carteraVencidaLive > 0
                    ? "opacity-50 pointer-events-none"
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === "CUOTA"}
                  onChange={() => {
                    setTipo("CUOTA");
                    setMonto(
                      Number(cred?.cuota || 0)
                    );
                    setSemanasVencidas("");
                  }}
                  disabled={
                    carteraVencidaLive > 0 ||
                    finalizado ||
                    !pertenece
                  }
                />
                <div className="flex-1">
                  <div className="font-medium">
                    Cuota semanal
                  </div>
                  <div className="text-[12px] text-muted">
                    {money(cuota)}
                  </div>
                </div>
              </label>

              {/* VENCIDA */}
              <label className="border rounded-2 p-2 flex gap-2 items-center">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === "VENCIDA"}
                  onChange={() => {
                    setTipo("VENCIDA");
                    setMonto(
                      carteraVencidaLive > 0
                        ? Math.max(
                            carteraVencidaLive,
                            0
                          )
                        : Number(
                            cred?.cuota || 0
                          )
                    );
                    // semanas se llena manual si quiere
                  }}
                  disabled={
                    finalizado || !pertenece
                  }
                />
                <div className="flex-1">
                  <div className="font-medium">
                    Cuota vencida
                  </div>
                  <div className="text-[12px] text-muted">
                    {carteraVencidaLive > 0
                      ? `${money(
                          carteraVencidaLive
                        )} en ${totalSemanasVencidas} semanas`
                      : "Sin vencidos"}
                  </div>
                </div>
              </label>

              {/* ABONO */}
              <label className="border rounded-2 p-2 flex gap-2 items-center">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === "ABONO"}
                  onChange={() => {
                    setTipo("ABONO");
                    setSemanasVencidas("");
                  }}
                  disabled={
                    finalizado || !pertenece
                  }
                />
                <div className="flex-1">
                  <div className="font-medium">
                    Abono
                  </div>
                  <div className="text-[12px] text-muted">
                    Monto libre
                  </div>
                </div>
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-2">
              <label className="block sm:col-span-1">
                <div className="text-[12px] text-muted mb-1">
                  Monto
                </div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={monto}
                  onChange={(e) =>
                    setMonto(
                      Number(e.target.value || 0)
                    )
                  }
                  disabled={
                    finalizado ||
                    !pertenece ||
                    tipo === "CUOTA"
                  }
                />
              </label>

              <label className="block sm:col-span-2">
                <div className="text-[12px] text-muted mb-1">
                  Nota (opcional)
                </div>
                <input
                  className="input"
                  placeholder="Observaciones del pago…"
                  value={nota}
                  onChange={(e) =>
                    setNota(e.target.value)
                  }
                  disabled={
                    finalizado ||
                    !pertenece
                  }
                />
              </label>
            </div>

            {/* Semanas vencidas a pagar (solo cuando tipo = VENCIDA) */}
            {tipo === "VENCIDA" &&
              carteraVencidaLive > 0 && (
                <div className="grid sm:grid-cols-3 gap-2 items-end">
                  <div className="sm:col-span-1">
                    <div className="text-[12px] text-muted mb-1">
                      Semanas vencidas
                      totales
                    </div>
                    <div className="text-[13px]">
                      {totalSemanasVencidas}
                    </div>
                  </div>
                  <label className="block sm:col-span-2">
                    <div className="text-[12px] text-muted mb-1">
                      Semanas vencidas a
                      pagar (opcional)
                    </div>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      step={1}
                      value={
                        semanasVencidas === ""
                          ? ""
                          : semanasVencidas
                      }
                      onChange={(e) => {
                        const v =
                          e.target.value;
                        if (!v) {
                          setSemanasVencidas(
                            ""
                          );
                        } else {
                          const n =
                            Number(v);
                          setSemanasVencidas(
                            Number.isNaN(
                              n
                            )
                              ? ""
                              : n
                          );
                        }
                      }}
                      disabled={
                        finalizado ||
                        !pertenece
                      }
                    />
                  </label>
                </div>
              )}

            {/* Fecha del pago */}
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="block sm:col-span-1">
                <div className="text-[12px] text-muted mb-1">
                  Fecha del pago
                </div>
                <input
                  className="input"
                  type="datetime-local"
                  value={fechaPago}
                  onChange={(e) =>
                    setFechaPago(
                      e.target.value
                    )
                  }
                  disabled={
                    finalizado ||
                    !pertenece
                  }
                />
              </label>
              <div className="sm:col-span-1 flex items-end">
                <button
                  className="btn-outline btn--sm"
                  onClick={() =>
                    setFechaPago(
                      toLocalDateTimeInputValue(
                        new Date()
                      )
                    )
                  }
                  disabled={
                    finalizado ||
                    !pertenece
                  }
                  title="Usar ahora"
                >
                  <RefreshCcw className="w-4 h-4" />{" "}
                  Ahora
                </button>
              </div>
            </div>

            {/* Simulador */}
            <div className="border rounded-2 p-2">
              <div className="text-[12.5px] font-medium mb-1">
                Simulación
              </div>
              {simulando ? (
                <div className="text-[12.5px] text-muted">
                  Calculando…
                </div>
              ) : simu.length === 0 ? (
                <div className="text-[12.5px] text-muted">
                  Indica un monto para
                  ver cómo se aplicará.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left text-[12px] text-muted">
                          Semana
                        </th>
                        <th className="text-right text-[12px] text-muted">
                          Aplica
                        </th>
                        <th className="text-right text-[12px] text-muted">
                          Saldo semana
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {simu.map((s) => (
                        <tr
                          key={
                            s.num_semana
                          }
                        >
                          <td className="text-[13px] py-1">
                            #
                            {
                              s.num_semana
                            }
                          </td>
                          <td className="text-[13px] py-1 text-right">
                            {money(
                              s.aplica
                            )}
                          </td>
                          <td className="text-[13px] py-1 text-right">
                            {money(
                              s.saldo_semana
                            )}
                          </td>
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
                disabled={
                  finalizado || !pertenece
                }
                title={
                  !pertenece
                    ? "Crédito fuera de tus asignaciones"
                    : finalizado
                    ? "Crédito finalizado"
                    : undefined
                }
              >
                <ShieldAlert className="w-4 h-4" />{" "}
                Cuota a vencida
              </button>
              <button
                className="btn-primary btn--sm"
                onClick={onRegistrarPago}
                disabled={
                  finalizado ||
                  !pertenece ||
                  cuotas.length === 0 ||
                  saving
                }
                title={
                  !pertenece
                    ? "Crédito fuera de tus asignaciones"
                    : finalizado
                    ? "Crédito finalizado"
                    : undefined
                }
              >
                <Save className="w-4 h-4" />{" "}
                {saving
                  ? "Guardando…"
                  : "Registrar pago"}
              </button>
            </div>
          </div>

          {/* Historial */}
          <div className="lg:col-span-2">
            <div className="flex gap-2 border-b">
              <button
                className={`btn-ghost !h-8 !px-3 text-xs ${
                  tab === "cuotas"
                    ? "nav-active"
                    : ""
                }`}
                onClick={() =>
                  setTab("cuotas")
                }
              >
                Cuotas
              </button>
              <button
                className={`btn-ghost !h-8 !px-3 text-xs ${
                  tab === "pagos"
                    ? "nav-active"
                    : ""
                }`}
                onClick={() =>
                  setTab("pagos")
                }
              >
                Pagos realizados
              </button>
              <button
                className={`btn-ghost !h-8 !px-3 text-xs ${
                  tab === "multas"
                    ? "nav-active"
                    : ""
                }`}
                onClick={() =>
                  setTab("multas")
                }
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
                      <th className="text-right">
                        Programado
                      </th>
                      <th className="text-right">
                        Arrastre ant.
                      </th>
                      <th className="text-right">
                        Total pago
                      </th>
                      <th className="text-right">
                        Abonado
                      </th>
                      <th className="text-right">
                        Debe
                      </th>
                      <th className="text-center">
                        M15
                      </th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuotasCalculadas.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="text-center text-[13px] text-muted py-4"
                        >
                          Sin cuotas.
                        </td>
                      </tr>
                    ) : (
                      cuotasCalculadas.map(
                        (c) => (
                          <tr
                            key={c.id}
                          >
                            <td className="text-[13px] text-center">
                              #
                              {
                                c.num_semana
                              }
                            </td>
                            <td className="text-[13px] text-center">
                              {
                                c.fecha_programada
                              }
                            </td>
                            <td className="text-[13px] text-right">
                              {money(
                                c.monto_programado
                              )}
                            </td>
                            <td className="text-[13px] text-right">
                              {money(
                                (c as any)
                                  .arrastreAnterior ??
                                  0
                              )}
                            </td>
                            <td className="text-[13px] text-right">
                              {money(
                                (c as any)
                                  .totalSemana ??
                                  0
                              )}
                            </td>
                            <td className="text-[13px] text-right">
                              {money(
                                c.abonado
                              )}
                            </td>
                            <td className="text-[13px] text-right">
                              {money(
                                c.debe
                              )}
                            </td>
                            <td className="text-[13px] text-center">
                              {c.m15_count >
                              0 ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-2 text-[11px] ${
                                    c.m15_activa
                                      ? "bg-red-100 text-red-700"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  <ShieldAlert className="w-3 h-3" />{" "}
                                  M15
                                </span>
                              ) : (
                                <span className="text-muted">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="text-[13px]">
                              {c.estadoUi ===
                              "PAGADA" ? (
                                <span className="text-green-700 font-medium">
                                  PAGADA
                                </span>
                              ) : c.estadoUi ===
                                "VENCIDA" ? (
                                <span className="text-red-700 font-medium">
                                  VENCIDA
                                </span>
                              ) : c.estadoUi ===
                                "ABONADO" ? (
                                <span className="text-amber-700 font-medium">
                                  ABONADO
                                </span>
                              ) : (
                                <span className="text-gray-600">
                                  PENDIENTE
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      )
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
                      <th className="text-right">
                        Monto
                      </th>
                      <th>Nota</th>
                      <th className="text-center">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-center text-[13px] text-muted py-4"
                        >
                          Sin pagos registrados.
                        </td>
                      </tr>
                    ) : (
                      pagos.map((p) => (
                        <tr key={p.id}>
                          <td className="text-[13px]">
                            {new Date(
                              p.fecha
                            ).toLocaleString()}
                          </td>
                          <td className="text-[13px">
                            {p.tipo}
                          </td>
                          <td className="text-[13px] text-right">
                            {money(p.monto)}
                          </td>
                          <td className="text-[13px]">
                            {p.nota ?? "—"}
                          </td>
                          <td className="text-center">
                            <div className="inline-flex gap-2">
                              <button
                                className="btn-outline btn--sm"
                                onClick={() =>
                                  startEditPago(
                                    p
                                  )
                                }
                                disabled={
                                  finalizado ||
                                  !pertenece
                                }
                                title={
                                  !pertenece
                                    ? "Crédito fuera de tus asignaciones"
                                    : finalizado
                                    ? "Crédito finalizado"
                                    : undefined
                                }
                              >
                                <Pencil className="w-4 h-4" />{" "}
                                Editar
                              </button>
                              <button
                                className="btn-outline btn--sm"
                                onClick={() =>
                                  onEliminarPago(
                                    p
                                  )
                                }
                                disabled={
                                  finalizado ||
                                  !pertenece
                                }
                                title={
                                  !pertenece
                                    ? "Crédito fuera de tus asignaciones"
                                    : finalizado
                                    ? "Crédito finalizado"
                                    : undefined
                                }
                              >
                                <Trash2 className="w-4 h-4" />{" "}
                                Eliminar
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
                      <th className="text-right">
                        Monto
                      </th>
                      <th className="text-right">
                        Pagado
                      </th>
                      <th className="text-center">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {multas.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="text-center text-[13px] text-muted py-4"
                        >
                          Sin multas.
                        </td>
                      </tr>
                    ) : (
                      multas.map((m) => (
                        <tr key={m.id}>
                          <td className="text-[13px]">
                            {new Date(
                              m.fecha_creacion
                            ).toLocaleString()}
                          </td>
                          <td className="text-[13px] text-center">
                            #
                            {m.semana ??
                              "—"}
                          </td>
                          <td className="text-[13px] text-center">
                            {m.activa
                              ? "Sí"
                              : "No"}
                          </td>
                          <td className="text-[13px]">
                            {m.estado}
                          </td>
                          <td className="text-[13px] text-right">
                            {money(
                              m.monto
                            )}
                          </td>
                          <td className="text-[13px] text-right">
                            {money(
                              m.monto_pagado
                            )}
                          </td>
                          <td className="text-center">
                            <div className="inline-flex gap-2">
                              <button
                                className="btn-outline btn--sm"
                                onClick={async () => {
                                  if (
                                    finalizado ||
                                    !pertenece
                                  )
                                    return;
                                  m.activa
                                    ? await desactivarMulta(
                                        m.id
                                      )
                                    : await activarMulta(
                                        m.id
                                      );
                                  await refreshCredito();
                                }}
                                disabled={
                                  finalizado ||
                                  !pertenece
                                }
                                title={
                                  !pertenece
                                    ? "Crédito fuera de tus asignaciones"
                                    : finalizado
                                    ? "Crédito finalizado"
                                    : undefined
                                }
                              >
                                {m.activa
                                  ? "Desactivar"
                                  : "Activar"}
                              </button>
                              <button
                                className="btn-outline btn--sm"
                                onClick={async () => {
                                  if (
                                    finalizado ||
                                    !pertenece
                                  )
                                    return;
                                  if (
                                    await confirm(
                                      {
                                        tone: "danger",
                                        title:
                                          "Eliminar multa",
                                        message: `¿Eliminar la multa #${m.id}?`,
                                        confirmText:
                                          "Eliminar",
                                      }
                                    )
                                  ) {
                                    await eliminarMulta(
                                      m.id
                                    );
                                    await refreshCredito();
                                  }
                                }}
                                disabled={
                                  finalizado ||
                                  !pertenece
                                }
                                title={
                                  !pertenece
                                    ? "Crédito fuera de tus asignaciones"
                                    : finalizado
                                    ? "Crédito finalizado"
                                    : undefined
                                }
                              >
                                <Trash2 className="w-4 h-4" />{" "}
                                Eliminar
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
          Busca un crédito por <b>folio externo</b>,{" "}
          <b>CR-#</b> o <b>nombre</b> para ver su
          resumen, registrar pagos, marcar vencidas y
          gestionar M15.
        </div>
      )}

      {/* Modal editar nota */}
      {editPago && (
        <div className="modal">
          <div className="modal-card modal-card-sm">
            <div className="modal-head">
              <div className="text-[13px] font-medium">
                Editar nota del pago #
                {editPago.id}
              </div>
              <button
                className="btn-ghost !h-8 !px-3 text-xs"
                onClick={() =>
                  setEditPago(null)
                }
              >
                <X className="w-4 h-4" /> Cerrar
              </button>
            </div>
            <div className="p-3 grid gap-2">
              <div className="text-[12.5px]">
                Monto:{" "}
                <b>
                  {money(editPago.monto)}
                </b>{" "}
                — Tipo:{" "}
                <b>{editPago.tipo}</b>
              </div>
              <label className="block">
                <div className="text-[12px] text-muted mb-1">
                  Nota
                </div>
                <input
                  className="input"
                  value={editNota}
                  onChange={(e) =>
                    setEditNota(
                      e.target.value
                    )
                  }
                  disabled={
                    finalizado ||
                    !pertenece
                  }
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  className="btn-outline btn--sm"
                  onClick={() =>
                    setEditPago(null)
                  }
                >
                  Cancelar
                </button>
                <button
                  className="btn-primary btn--sm"
                  onClick={saveEditPago}
                  disabled={
                    finalizado ||
                    !pertenece
                  }
                >
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
          renovacionOrigen={{
            creditoId: cred.id,
          }}
          onClose={() =>
            setOpenWizard(false)
          }
          onCreated={async () => {
            setOpenWizard(false);
            await refreshCredito();
          }}
        />
      )}
    </div>
  );
}
