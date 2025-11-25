// src/pages/Amortizacion.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Info, ExternalLink, Download, Share2, Pencil, Globe, Lock, AlertTriangle, X,
  CalendarClock, FileText, Home, UserSquare2
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../lib/supabase";
import useConfirm from "../components/Confirm";
import { getCuotas, getCreditoById, money, type CreditoPagable, type CuotaRow } from "../services/pagos.service";
import {
  ensureLinkForCredito,
  fetchLinkByCredito,
  updateLinkMeta,
  buildAmortPublicUrl,
  type AmortLink,
} from "../services/sharelinks.service";
import {
  fetchEncabezadoExtendido,
  normalizeDiaSemana,    // <-- NUEVO: usamos el normalizador exportado
} from "../services/amortizacion.service";

/* ===== Utils ===== */
function iso(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d); }
}
function fmt(n: number | null | undefined) { return money(Number(n || 0)); }

/* Color helpers UI */
function estadoColorClass(estado: string): string {
  // VENCIDA rojo, PAGADA verde, ADELANTADA azul, PENDIENTE/otros neutral
  switch (estado) {
    case "VENCIDA": return "text-red-700";
    case "PAGADA": return "text-green-700";
    case "ADELANTADA": return "text-blue-700";
    default: return "text-gray-700";
  }
}

export default function Amortizacion() {
  const params = useParams<{ id?: string }>();
  const { search } = useLocation();
  const navigate = useNavigate();
  const [confirm, ConfirmUI] = useConfirm();

  const creditoIdParam = params.id ? Number(params.id) : null;
  const sp = new URLSearchParams(search);
  const token = sp.get("token");

  const [cred, setCred] = useState<CreditoPagable | null>(null);
  const [cuotas, setCuotas] = useState<CuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Encabezado extendido (incluye día real de cobranza)
  const [poblacionFull, setPoblacionFull] = useState<string | null>(null);
  const [rutaNombre, setRutaNombre] = useState<string | null>(null);
  const [domTitular, setDomTitular] = useState<string | null>(null);
  const [avalNombre, setAvalNombre] = useState<string | null>(null);
  const [avalDom, setAvalDom] = useState<string | null>(null);
  const [diaCobranza, setDiaCobranza] = useState<string | null>(null);

  // Frecuencia **estrictamente** el día de cobranza de población
  const frecuenciaDia = useMemo(() => normalizeDiaSemana(diaCobranza), [diaCobranza]);

  // UI: popover ayuda
  const [showHelp, setShowHelp] = useState(false);

  const interno = useMemo(() => creditoIdParam != null && !token, [creditoIdParam, token]);
  const publicoPorToken = useMemo(() => !creditoIdParam && !!token, [creditoIdParam, token]);

  const [link, setLink] = useState<AmortLink | null>(null);
  const [editing, setEditing] = useState(false);
  const [editPublico, setEditPublico] = useState<boolean>(false);
  const [editAuto, setEditAuto] = useState<boolean>(true);
  const [editDesde, setEditDesde] = useState<string>("");
  const [editHasta, setEditHasta] = useState<string>("");

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const queueRefresh = async () => {
    if (refreshTimerRef.current != null) return;
    refreshTimerRef.current = window.setTimeout(async () => {
      refreshTimerRef.current = null;
      await refreshData();
    }, 250);
  };

  async function refreshData() {
    try {
      if (interno && creditoIdParam) {
        const c = await getCreditoById(creditoIdParam);
        if (!c) throw new Error("Crédito no encontrado o fuera de tus asignaciones.");
        setCred(c);
        const cuotasRaw = await getCuotas(c.id);
        setCuotas(cuotasRaw);

        const extra = await fetchEncabezadoExtendido(c.id);
        setPoblacionFull(extra.poblacion);
        setRutaNombre(extra.ruta);
        setDomTitular(extra.cliente_domicilio);
        setAvalNombre(extra.aval_nombre);
        setAvalDom(extra.aval_domicilio);
        setDiaCobranza(extra.dia_cobranza); // <-- se usa directo

        setLink(await fetchLinkByCredito(c.id));
      } else if (publicoPorToken && token) {
        const { data, error } = await supabase
          .from("amort_links")
          .select("id, credito_id, token, publico, vigencia_desde, vigencia_hasta, created_at")
          .eq("token", token)
          .maybeSingle();
        if (error) throw error;
        const l = (data as any) as AmortLink | null;
        if (!l) throw new Error("Enlace inválido o inexistente.");

        const now = new Date();
        const dOk = !l.vigencia_desde || new Date(l.vigencia_desde) <= now;
        const hOk = !l.vigencia_hasta || now <= new Date(l.vigencia_hasta);
        if (!l.publico || !dOk || !hOk) {
          setErr("El enlace no está disponible por el momento. Comunícate con tu coordinadora para habilitar el acceso.");
          setCred(null); setCuotas([]); setLink(l);
          return;
        }
        setLink(l);
        const c = await getCreditoById(l.credito_id);
        if (!c) throw new Error("Crédito no disponible.");
        setCred(c);
        const cuotasRaw = await getCuotas(c.id);
        setCuotas(cuotasRaw);

        const extra = await fetchEncabezadoExtendido(c.id);
        setPoblacionFull(extra.poblacion);
        setRutaNombre(extra.ruta);
        setDomTitular(extra.cliente_domicilio);
        setAvalNombre(extra.aval_nombre);
        setAvalDom(extra.aval_domicilio);
        setDiaCobranza(extra.dia_cobranza); // <-- se usa directo
      } else {
        throw new Error("Ruta inválida.");
      }
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo cargar la información.");
      setCred(null);
      setCuotas([]);
    }
  }

  useEffect(() => { (async () => { setLoading(true); await refreshData(); setLoading(false); })(); /* eslint-disable-next-line */ }, [params.id, token]);

  useEffect(() => {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const creditoId = cred?.id;
    if (!creditoId) return;

    const chan = supabase.channel(`amort-realtime-${creditoId}`);
    for (const t of ["pagos", "creditos_cuotas", "multas"] as const) {
      chan.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `credito_id=eq.${creditoId}` }, () => queueRefresh());
    }
    chan.subscribe();
    channelRef.current = chan;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
      channelRef.current = null; refreshTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cred?.id]);

  // ===== KPIs
  const carteraVencida = useMemo(
    () => cuotas.filter((q) => q.estado === "VENCIDA").reduce((s, q) => s + Number(q.debe || 0), 0),
    [cuotas]
  );
  const pagadas = useMemo(() => cuotas.filter((q) => q.estado === "PAGADA").length, [cuotas]);
  const totSemanas = useMemo(
    () => (cuotas.length ? Math.max(...cuotas.map((q) => q.num_semana)) : cred?.semanas_plan || 0),
    [cuotas, cred?.semanas_plan]
  );
  const avance = useMemo(() => (totSemanas ? `${pagadas} de ${totSemanas}` : "—"), [pagadas, totSemanas]);

  const hoyISO = new Date().toISOString().slice(0, 10);
  const pagosAdelantados = useMemo(
    () => cuotas.filter((q) => Number(q.abonado || 0) >= Number(q.monto_programado || 0) && q.fecha_programada > hoyISO).length,
    [cuotas, hoyISO]
  );
  const vencidasCount = useMemo(
    () => cuotas.filter((q) => q.estado === "VENCIDA" && (q.debe || 0) > 0).length,
    [cuotas]
  );
  const nextPendiente = useMemo(() => cuotas.find((q) => q.estado !== "PAGADA") || null, [cuotas]);
  const proximoPagoFecha = useMemo(() => (nextPendiente ? nextPendiente.fecha_programada : "—"), [nextPendiente]);
  const proximoPagoMonto = useMemo(() => {
    const vencidos = cuotas.filter((q) => q.estado === "VENCIDA").reduce((s, q) => s + Number(q.debe || 0), 0);
    return vencidos + Number(cred?.cuota || 0);
  }, [cuotas, cred?.cuota]);

  function estadoConAdelantada(row: CuotaRow): "PAGADA" | "PENDIENTE" | "PARCIAL" | "VENCIDA" | "ADELANTADA" {
    const base = row.estado;
    if (base === "PAGADA" && row.fecha_programada > hoyISO) return "ADELANTADA";
    return base;
  }

  /* ===== PDF (centrado + márgenes + población + frecuencia correcta) ===== */
  function descargarPDF() {
    if (!cred) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = { left: 18, right: 18, top: 16, bottom: 14 } as const;
    const usableW = pageW - margin.left - margin.right;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Tabla de amortización", margin.left, margin.top + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Generado: ${new Date().toISOString().slice(0, 10)}`, margin.left, margin.top + 18);

    const headRows: Array<[string, string]> = [
      ["Número de crédito", String(cred.folio_publico || cred.folio_externo || `CR-${cred.id}`)],
      ["Titular", `${cred.sujeto === "CLIENTE" ? cred.cliente_nombre : cred.coordinadora_nombre} (${cred.sujeto})`],
      ["Monto total", fmt(cred.monto_total)],
      ["Adeudo total", fmt(cred.adeudo_total)],
      ["Cuota", fmt(cred.cuota)],
      ["Avance", `${avance}`],
      // Frecuencia = día de cobranza de población, estrictamente
      ["Frecuencia de pagos", frecuenciaDia || "—"],
      ["Población", poblacionFull || "—"],
      ["Ruta", rutaNombre || "—"],
      ["Domicilio titular", domTitular || "—"],
      ["Aval", avalNombre || "—"],
      ["Domicilio aval", avalDom || "—"],
    ];

    let y = margin.top + 36;
    const leftLabelW = 130;
    const lineH = 12;
    doc.setFontSize(9);
    headRows.forEach(([k, v]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${k}:`, margin.left, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(v), margin.left + leftLabelW, y, { maxWidth: usableW - leftLabelW });
      y += lineH;
    });

    const head = [["Semana", "Fecha", "Programado", "Abonado", "Debe", "M15", "Estado"]];
    const body = cuotas.map((q) => {
      const est = estadoConAdelantada(q);
      const m15 = q.m15_count > 0 ? (q.m15_activa ? "M15 (activa)" : "M15") : "";
      return [`#${q.num_semana}`, iso(q.fecha_programada), fmt(q.monto_programado), fmt(q.abonado), fmt(q.debe), m15, est];
    });

    autoTable(doc, {
      head, body,
      startY: y + 6,
      margin: { left: margin.left, right: margin.right },
      tableWidth: usableW,
      styles: { fontSize: 7, cellPadding: 1.4, overflow: "linebreak", valign: "middle", minCellHeight: 9, lineWidth: 0.2, halign: "center" },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, halign: "center", fontStyle: "bold", fontSize: 7.6 },
      columnStyles: {
        0: { cellWidth: usableW * 0.09 },
        1: { cellWidth: usableW * 0.14 },
        2: { cellWidth: usableW * 0.16, halign: "center" },
        3: { cellWidth: usableW * 0.16, halign: "center" },
        4: { cellWidth: usableW * 0.16, halign: "center" },
        5: { cellWidth: usableW * 0.17, halign: "center" },
        6: { cellWidth: usableW * 0.12, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        if (data.column.index === 6) {
          const valor = String(data.cell.raw || "");
          if (valor === "VENCIDA") data.cell.styles.textColor = [200, 0, 0];
          else if (valor === "PAGADA") data.cell.styles.textColor = [0, 128, 0];
          else if (valor === "ADELANTADA") data.cell.styles.textColor = [0, 70, 200];
          else data.cell.styles.textColor = [60, 60, 60];
        }
      },
      didDrawPage: () => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - margin.right - 54, pageH - 6);
      },
      pageBreak: "auto",
      rowPageBreak: "avoid",
    });

    const safe = String(cred.folio_publico || cred.folio_externo || cred.id).replace(/[\/\\:?*"<>|]/g, "_");
    doc.save(`amortizacion_${safe}.pdf`);
  }

  // Compartir / Editar
  async function ensureAndOpenEdit() {
    if (!interno || !cred) return;
    const l = link ?? (await ensureLinkForCredito(cred.id));
    setLink(l);
    setEditPublico(!!l.publico);
    setEditAuto(!!l.vigencia_desde || !!l.vigencia_hasta ? false : true);
    setEditDesde(iso(l.vigencia_desde));
    setEditHasta(iso(l.vigencia_hasta));
    setEditing(true);
  }
  async function saveEdit() {
    if (!link || !cred) return;
    const auto = editAuto;
    let desde: string | null = null;
    let hasta: string | null = null;

    if (!auto) {
      if (!editDesde || !editHasta) {
        await confirm({ tone: "warn", title: "Rango inválido", message: "Indica vigencia desde y hasta." });
        return;
      }
      desde = editDesde; hasta = editHasta;
      if (new Date(desde) > new Date(hasta)) {
        await confirm({ tone: "warn", title: "Rango inválido", message: "La fecha de inicio debe ser anterior a la de fin." });
        return;
      }
    } else {
      const desdeISO = new Date().toISOString().slice(0, 10);
      const ultima = cuotas.length ? cuotas[cuotas.length - 1].fecha_programada : cred?.primer_pago || desdeISO;
      desde = desdeISO; hasta = ultima;
    }

    const updated = await updateLinkMeta(link.id, { publico: editPublico, vigencia_desde: desde, vigencia_hasta: hasta });
    setLink(updated);
    setEditing(false);
    await confirm({
      title: "Enlace actualizado",
      message: editPublico ? "El enlace está PÚBLICO dentro del rango de vigencia." : "El enlace quedó PRIVADO.",
    });
  }

  if (loading) return <div className="p-4 text-[13px]">Cargando…</div>;
  if (err) {
    return (
      <div className="p-4">
        <div className="alert alert--error flex items-center gap-2 text-[13px]">
          <AlertTriangle className="w-4 h-4" />
          <div className="flex-1">{err}</div>
          {!publicoPorToken && <button className="btn-outline btn--sm" onClick={() => navigate(-1)}>Volver</button>}
        </div>
      </div>
    );
  }
  if (!cred) return null;

  const tituloCredito = cred.folio_publico || cred.folio_externo || `CR-${cred.id}`;
  const titular = cred.sujeto === "CLIENTE" ? cred.cliente_nombre : cred.coordinadora_nombre;

  // ====== Encabezado unificado (tarjeta)
  const HeaderUnified = (
    <div className="card p-3 grid gap-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-muted">Crédito</div>
          <div className="font-semibold flex items-center gap-2 flex-wrap">
            <FileText className="w-4 h-4" />
            <span className="badge">{String(tituloCredito)}</span>
            <span className="text-[12px] text-muted">· Titular</span>
            <span className="font-medium truncate max-w-[420px]">{titular}</span>
            <span className="badge">{cred.sujeto}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 shrink-0">
          <div>
            <div className="text-[12px] text-muted">Monto total</div>
            <div className="font-medium">{fmt(cred.monto_total)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Adeudo total</div>
            <div className="font-medium">{fmt(cred.adeudo_total)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Cuota</div>
            <div className="font-medium">{fmt(cred.cuota)}</div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] text-muted">Avance</div>
            <div className="font-medium"><span className="badge">{avance}</span></div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Frecuencia de pagos</div>
            <div className="font-medium">{frecuenciaDia || "—"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-[12px] text-muted">Próximo pago</div>
            <div className="font-medium flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              {iso(proximoPagoFecha)} — {fmt(proximoPagoMonto)}
            </div>
          </div>

          <div className="px-2 py-1 border rounded text-green-800 bg-green-50">
            <div className="text-[12px]">Pagos adelantados</div>
            <div className="text-[14px] font-semibold">{pagosAdelantados}</div>
          </div>
          <div className="px-2 py-1 border rounded text-red-800 bg-red-50">
            <div className="text-[12px]">Pagos vencidos</div>
            <div className="text-[14px] font-semibold">{vencidasCount}</div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted">Población</span>
            <span className="px-2 py-1 border rounded">{poblacionFull || "—"}</span>
            <span className="text-[12px] text-muted">Ruta</span>
            <span className="px-2 py-1 border rounded">{rutaNombre || "—"}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="grid gap-1">
              <span className="text-[12px] text-muted flex items-center gap-1">
                <Home className="w-3.5 h-3.5" /> Domicilio titular
              </span>
              <span className="px-2 py-1 border rounded min-h-[28px]">{domTitular || "—"}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-[12px] text-muted flex items-center gap-1">
                <UserSquare2 className="w-3.5 h-3.5" /> Aval
              </span>
              <span className="px-2 py-1 border rounded min-h-[28px]">
                <b>{avalNombre || "—"}</b>{avalDom ? ` — ${avalDom}` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ==================== VISTA PÚBLICA (TOKEN) ==================== */
  if (publicoPorToken) {
    return (
      <div className="p-2 sm:p-3 grid gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold">Amortización</div>
          <button className="btn-primary btn--sm" onClick={descargarPDF}>
            <Download className="w-4 h-4" /> Descargar PDF
          </button>
        </div>

        {HeaderUnified}

        {/* Tabla */}
        <div className="table-frame overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Fecha</th>
                <th className="text-center">Programado</th>
                <th className="text-center">Abonado</th>
                <th className="text-center">Debe</th>
                <th className="text-center">M15</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuotas.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-[13px] text-muted py-4">Sin cuotas generadas.</td></tr>
              ) : (
                cuotas.map((c) => {
                  const est = estadoConAdelantada(c);
                  return (
                    <tr key={c.id}>
                      <td className="text-center">#{c.num_semana}</td>
                      <td className="text-center">{iso(c.fecha_programada)}</td>
                      <td className="text-center">{fmt(c.monto_programado)}</td>
                      <td className="text-center">{fmt(c.abonado)}</td>
                      <td className="text-center">{fmt(c.debe)}</td>
                      <td className="text-center">
                        {c.m15_count > 0 ? (c.m15_activa ? "M15 (activa)" : "M15") : "—"}
                      </td>
                      <td className={estadoColorClass(est)}>{est}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ==================== VISTA INTERNA ==================== */
  return (
    <div className="p-3 grid gap-3 relative">
      {ConfirmUI}

      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Amortización
          <button
            className="btn-ghost !h-7 !px-2 text-xs relative"
            title={showHelp ? "Ocultar ayuda" : "Mostrar ayuda"}
            onClick={() => setShowHelp((s) => !s)}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" onClick={descargarPDF} title="Descargar PDF">
            <Download className="w-4 h-4" /> Descargar
          </button>
          <button className="btn-primary btn--sm" onClick={ensureAndOpenEdit} title="Compartir / Editar enlace">
            <Share2 className="w-4 h-4" /> {link ? "Compartir / Editar" : "Compartir"}
          </button>
        </div>
      </div>

      {/* Popover flotante de ayuda */}
      {showHelp && (
        <div
          className="absolute z-[10020] top-10 left-3 w-[320px] max-w-[92vw] bg-white border rounded shadow-lg p-3 text-[12.5px]"
          role="dialog"
        >
          <div className="flex items-start justify-between mb-1">
            <div className="font-medium flex items-center gap-1"><Info className="w-4 h-4" /> Ayuda</div>
            <button className="btn-ghost !h-6 !px-2 text-xs" onClick={() => setShowHelp(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="text-[12.5px] leading-relaxed">
            • En “M15” se resalta cuando está <b>activa</b>.<br />
            • <b>ADELANTADA</b>: cuota pagada antes de su fecha programada.<br />
            • Totales y estados se actualizan en tiempo real con los pagos.
          </div>
        </div>
      )}

      {/* Encabezado unificado */}
      {HeaderUnified}

      {/* Tabla */}
      <div className="table-frame overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>Semana</th>
              <th>Fecha</th>
              <th className="text-center">Programado</th>
              <th className="text-center">Abonado</th>
              <th className="text-center">Debe</th>
              <th className="text-center">M15</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cuotas.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-[13px] text-muted py-4">
                  Sin cuotas generadas.
                </td>
              </tr>
            ) : (
              cuotas.map((c) => {
                const est = estadoConAdelantada(c);
                return (
                  <tr key={c.id}>
                    <td className="text-center text-[13px]">#{c.num_semana}</td>
                    <td className="text-center text-[13px]">{iso(c.fecha_programada)}</td>
                    <td className="text-center text-[13px]">{fmt(c.monto_programado)}</td>
                    <td className="text-center text-[13px]">{fmt(c.abonado)}</td>
                    <td className="text-center text-[13px]">{fmt(c.debe)}</td>
                    <td className="text-center text-[13px]">
                      {c.m15_count > 0 ? (
                        <span className={`${c.m15_activa ? "text-red-700" : "text-gray-600"}`}>{c.m15_activa ? "M15 (activa)" : "M15"}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`text-[13px] ${estadoColorClass(est)}`}>{est}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal compartir / editar */}
      {editing && link && (
        <div className="modal">
          <div className="modal-card modal-card-sm">
            <div className="modal-head">
              <div className="text-[13px] font-medium">Compartir / Editar enlace</div>
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => setEditing(false)}>
                <X className="w-4 h-4" /> Cerrar
              </button>
            </div>
            <div className="p-3 grid gap-3 text-[13px]">
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="border p-2">
                  <div className="text-[12px] text-muted mb-1">Visibilidad</div>
                  <div className="flex items-center gap-2">
                    <button className={`btn--sm ${editPublico ? "btn-primary" : "btn-outline"}`} onClick={() => setEditPublico(true)}>
                      <Globe className="w-4 h-4" /> Público
                    </button>
                    <button className={`btn--sm ${!editPublico ? "btn-primary" : "btn-outline"}`} onClick={() => setEditPublico(false)}>
                      <Lock className="w-4 h-4" /> Privado
                    </button>
                  </div>
                </div>

                <div className="border p-2">
                  <div className="text-[12px] text-muted mb-1">Vigencia</div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" checked={editAuto} onChange={() => setEditAuto(true)} /> Automática
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" checked={!editAuto} onChange={() => setEditAuto(false)} /> Manual
                    </label>
                  </div>
                  {!editAuto && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <label className="block">
                        <div className="text-[12px] text-muted mb-1">Desde</div>
                        <input className="input" type="date" value={editDesde} onChange={(e) => setEditDesde(e.target.value)} />
                      </label>
                      <label className="block">
                        <div className="text-[12px] text-muted mb-1">Hasta</div>
                        <input className="input" type="date" value={editHasta} onChange={(e) => setEditHasta(e.target.value)} />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-1">
                <div className="text-[12px] text-muted">URL</div>
                <div className="flex items-center gap-2">
                  <input className="input flex-1" readOnly value={buildAmortPublicUrl(link.token)} />
                  <a className="btn-outline btn--sm" href={buildAmortPublicUrl(link.token)} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4" /> Abrir
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button className="btn-outline btn--sm" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="btn-primary btn--sm" onClick={saveEdit}>
                  <Pencil className="w-4 h-4" /> Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
