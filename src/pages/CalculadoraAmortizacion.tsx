// src/pages/SimulacionAmortizacion.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Info, Download, CalendarClock, FileText, X, Globe, Lock, ExternalLink, UserSquare2, Home
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../lib/supabase";
import useConfirm from "../components/Confirm";
import { getMontosValidos, getCuotaSemanal, type SujetoCredito as Sujeto } from "../services/montos.service";

/* =========================
   Utilidades
========================= */
function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}
function iso(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d); }
}
// Días capitalizados (para UI y PDF)
const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
function normalizeDiaSemana(v?: string | null): string | null {
  if (!v) return null;
  const raw = v.toString().trim();
  const t = raw.toLowerCase();
  const idx = ["domingo","lunes","martes","miércoles","miercoles","jueves","viernes","sábado","sabado"].indexOf(t);
  if (idx === -1) {
    const tryDate = new Date(raw);
    if (!Number.isNaN(tryDate.getTime())) return DIAS_ES[tryDate.getDay()];
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  const map = ["Domingo","Lunes","Martes","Miércoles","Miércoles","Jueves","Viernes","Sábado","Sábado"];
  return map[idx];
}
function addDays(base: string, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* =========================
   Tipos locales
========================= */
type CuotaRow = {
  id: number;
  num_semana: number;
  fecha_programada: string;
  monto_programado: number;
  abonado: number;
  debe: number;
  m15_count: number;
  m15_activa: boolean;
  estado: "PENDIENTE" | "PAGADA" | "VENCIDA" | "PARCIAL";
};

/* =========================
   Página
========================= */
export default function SimulacionAmortizacion() {
  const [confirm, ConfirmUI] = useConfirm();

  // ---- Datos editables de simulación (ficticios pero coherentes)
  const [folio, setFolio] = useState<string>("");
  const [titular, setTitular] = useState<string>("");
  const [sujeto, setSujeto] = useState<Sujeto>("CLIENTE");

  const [poblacion, setPoblacion] = useState<string>("");
  const [ruta, setRuta] = useState<string>("");

  const [domTitular, setDomTitular] = useState<string>("");
  const [avalNombre, setAvalNombre] = useState<string>("");
  const [avalDom, setAvalDom] = useState<string>("");

  const [diaCobranza, setDiaCobranza] = useState<string>("Lunes"); // para mostrar como frecuencia
  const frecuenciaDia = useMemo(() => normalizeDiaSemana(diaCobranza), [diaCobranza]);

  const [fechaDisp, setFechaDisp] = useState<string>(new Date().toISOString().slice(0, 10));
  const primerPagoSugerido = useMemo(() => addDays(fechaDisp, 7), [fechaDisp]);
  const [primerPago, setPrimerPago] = useState<string>("");

  // Semanas y montos válidos
  const semanasOptions = useMemo(() => (sujeto === "CLIENTE" ? [13, 14] : [9, 10, 13, 14]), [sujeto]);
  const [semanas, setSemanas] = useState<number>(14);

  const [montos, setMontos] = useState<{ id: number; monto: number }[]>([]);
  const [montoId, setMontoId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await getMontosValidos(supabase, sujeto, semanas);
      if (!alive) return;
      setMontos(list);
      if (!list.length) setMontoId(null);
      else if (!list.some((x) => x.id === (montoId ?? -1))) setMontoId(list[0].id);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sujeto, semanas]);

  const monto = useMemo(() => Number(montos.find(x => x.id === montoId)?.monto ?? 0), [montoId, montos]);
  const cuota = useMemo(() => getCuotaSemanal(monto, semanas), [monto, semanas]);

  // ---- Generación de cuotas simuladas (semanales)
  const cuotas = useMemo<CuotaRow[]>(() => {
    if (!semanas || !cuota || !(primerPago || primerPagoSugerido)) return [];
    const start = (primerPago || primerPagoSugerido);
    const out: CuotaRow[] = [];
    for (let i = 1; i <= semanas; i++) {
      const f = addDays(start, (i - 1) * 7);
      out.push({
        id: i,
        num_semana: i,
        fecha_programada: f,
        monto_programado: cuota,
        abonado: 0,
        debe: cuota,
        m15_count: 0,
        m15_activa: false,
        estado: "PENDIENTE",
      });
    }
    return out;
  }, [semanas, cuota, primerPago, primerPagoSugerido]);

  // ---- KPIs (idénticos a Amortización)
  const pagadas = 0;
  const totSemanas = semanas || 0;
  const avance = useMemo(() => (totSemanas ? `${pagadas} de ${totSemanas}` : "—"), [pagadas, totSemanas]);
  const nextPendiente = useMemo(() => cuotas.find(q => q.estado !== "PAGADA") || null, [cuotas]);
  const proximoPagoFecha = nextPendiente ? nextPendiente.fecha_programada : "—";
  const proximoPagoMonto = (cuota || 0); // sin vencidos en simulación
  const montoTotal = monto; // principal
  const adeudoTotal = cuotas.reduce((s, q) => s + q.debe, 0);

  function estadoColorClass(estado: string): string {
    switch (estado) {
      case "VENCIDA": return "text-red-700";
      case "PAGADA": return "text-green-700";
      case "ADELANTADA": return "text-blue-700";
      default: return "text-gray-700";
    }
  }

  /* =========================
     PDF (idéntico a Amortización)
  ========================== */
  function descargarPDF() {
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
      ["Número de crédito", String(folio || "—")],
      ["Titular", `${titular || "—"} (${sujeto})`],
      ["Monto total", money(montoTotal)],
      ["Adeudo total", money(adeudoTotal)],
      ["Cuota", money(cuota)],
      ["Avance", `${avance}`],
      ["Frecuencia de pagos", frecuenciaDia || "—"],
      ["Población", poblacion || "—"],
      ["Ruta", ruta || "—"],
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
      const m15 = q.m15_count > 0 ? (q.m15_activa ? "M15 (activa)" : "M15") : "";
      return [`#${q.num_semana}`, iso(q.fecha_programada), money(q.monto_programado), money(q.abonado), money(q.debe), m15, q.estado];
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

    const safe = String(folio || "SIM").replace(/[\/\\:?*"<>|]/g, "_");
    doc.save(`amortizacion_${safe}.pdf`);
  }

  // ---- UI
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="p-3 grid gap-3 relative">
      {ConfirmUI}

      {/* Barra superior */}
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Simulación de amortización
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
        </div>
      </div>

      {/* Popover ayuda */}
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
            • Esta vista simula la tabla de amortización con datos que introduces aquí.<br />
            • El PDF incluye exactamente los mismos campos que la tabla de amortización real.<br />
            • Las cuotas se generan de forma semanal a partir del “Primer pago”.
          </div>
        </div>
      )}

      {/* Panel de datos (edición) */}
      <div className="card p-3 grid gap-3 text-[13px]">
        <div className="grid md:grid-cols-3 gap-3">
          <label className="block">
            <div className="text-[12px] text-muted mb-1">Número de crédito (Folio)</div>
            <input className="input" value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Ej. 12345" />
          </label>
          <label className="block">
            <div className="text-[12px] text-muted mb-1">Titular (nombre)</div>
            <input className="input" value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Nombre del titular" />
          </label>
          <label className="block">
            <div className="text-[12px] text-muted mb-1">Sujeto</div>
            <select
              className="input"
              value={sujeto}
              onChange={(e) => {
                const next = e.target.value as Sujeto;
                setSujeto(next);
                setSemanas(next === "CLIENTE" ? 14 : 10);
              }}
            >
              <option value="CLIENTE">Cliente</option>
              <option value="COORDINADORA">Coordinadora</option>
            </select>
          </label>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <label className="block">
            <div className="text-[12px] text-muted mb-1">Semanas</div>
            <select className="input" value={semanas} onChange={(e) => setSemanas(parseInt(e.target.value))}>
              {semanasOptions.map((w) => (<option key={w} value={w}>{w}</option>))}
            </select>
          </label>

          <label className="block">
            <div className="text-[12px] text-muted mb-1">Monto permitido</div>
            <select
              className="input"
              value={montoId ?? ""}
              onChange={(e) => setMontoId(e.target.value ? Number(e.target.value) : null)}
            >
              {!montos.length && <option value="">—</option>}
              {montos.map((m) => (
                <option key={m.id} value={m.id}>{money(m.monto)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-[12px] text-muted mb-1">Cuota semanal</div>
            <input className="input" value={money(cuota)} readOnly />
          </label>

          <label className="block">
            <div className="text-[12px] text-muted mb-1">Frecuencia (día de cobranza)</div>
            <select className="input" value={diaCobranza} onChange={(e) => setDiaCobranza(e.target.value)}>
              {DIAS_ES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <label className="block">
            <div className="text-[12px] text-muted mb-1">Población</div>
            <input className="input" value={poblacion} onChange={(e) => setPoblacion(e.target.value)} placeholder="Población, Municipio, Estado" />
          </label>
          <label className="block">
            <div className="text-[12px] text-muted mb-1">Ruta</div>
            <input className="input" value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="Nombre de la ruta" />
          </label>
          <label className="block">
            <div className="text-[12px] text-muted mb-1">Fecha de disposición</div>
            <input className="input" type="date" value={fechaDisp} onChange={(e) => {
              const v = e.target.value; setFechaDisp(v);
              if (primerPago && primerPago < v) setPrimerPago(v);
            }} />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-[12px] text-muted mb-1">Primer pago</div>
            <input className="input" type="date" min={fechaDisp} value={primerPago || primerPagoSugerido} onChange={(e) => setPrimerPago(e.target.value)} />
            {primerPago && primerPago < fechaDisp && (
              <div className="text-[12px] text-red-700 mt-1">
                El primer pago debe ser el mismo día o después de la disposición.
              </div>
            )}
          </label>
          <div />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="grid gap-1">
            <span className="text-[12px] text-muted flex items-center gap-1">
              <Home className="w-3.5 h-3.5" /> Domicilio titular
            </span>
            <input className="input" value={domTitular} onChange={(e) => setDomTitular(e.target.value)} placeholder="Calle, Colonia, Municipio, Estado" />
          </div>
          <div className="grid gap-1">
            <span className="text-[12px] text-muted flex items-center gap-1">
              <UserSquare2 className="w-3.5 h-3.5" /> Aval
            </span>
            <input className="input mb-2" value={avalNombre} onChange={(e) => setAvalNombre(e.target.value)} placeholder="Nombre del aval" />
            <input className="input" value={avalDom} onChange={(e) => setAvalDom(e.target.value)} placeholder="Domicilio del aval" />
          </div>
        </div>
      </div>

      {/* Encabezado unificado (idéntico a Amortización) */}
      <div className="card p-3 grid gap-3 text-[13px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-muted">Crédito</div>
            <div className="font-semibold flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4" />
              <span className="badge">{String(folio || "—")}</span>
              <span className="text-[12px] text-muted">· Titular</span>
              <span className="font-medium truncate max-w-[420px]">{titular || "—"}</span>
              <span className="badge">{sujeto}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div>
              <div className="text-[12px] text-muted">Monto total</div>
              <div className="font-medium">{money(montoTotal)}</div>
            </div>
            <div>
              <div className="text-[12px] text-muted">Adeudo total</div>
              <div className="font-medium">{money(adeudoTotal)}</div>
            </div>
            <div>
              <div className="text-[12px] text-muted">Cuota</div>
              <div className="font-medium">{money(cuota)}</div>
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
                {iso(proximoPagoFecha)} — {money(proximoPagoMonto)}
              </div>
            </div>

            <div className="px-2 py-1 border rounded text-green-800 bg-green-50">
              <div className="text-[12px]">Pagos adelantados</div>
              <div className="text-[14px] font-semibold">0</div>
            </div>
            <div className="px-2 py-1 border rounded text-red-800 bg-red-50">
              <div className="text-[12px]">Pagos vencidos</div>
              <div className="text-[14px] font-semibold">0</div>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted">Población</span>
              <span className="px-2 py-1 border rounded">{poblacion || "—"}</span>
              <span className="text-[12px] text-muted">Ruta</span>
              <span className="px-2 py-1 border rounded">{ruta || "—"}</span>
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

      {/* Tabla (idéntica a Amortización) */}
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
              cuotas.map((c) => (
                <tr key={c.id}>
                  <td className="text-center">#{c.num_semana}</td>
                  <td className="text-center">{iso(c.fecha_programada)}</td>
                  <td className="text-center">{money(c.monto_programado)}</td>
                  <td className="text-center">{money(c.abonado)}</td>
                  <td className="text-center">{money(c.debe)}</td>
                  <td className="text-center">—</td>
                  <td className={estadoColorClass(c.estado)}>{c.estado}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
