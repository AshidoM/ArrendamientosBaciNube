// client/src/lib/reportes.pdf.ts
import jsPDF from "jspdf";
import type { FichaPayload, CredLite } from "../services/reportes.service";

type Opts = {
  titulo?: string;
  autor?: string;
  masivo?: boolean; // true = múltiples fichas en un PDF
};

function money(n: number) {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(v);
}
function dateStr(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return "—";
  }
}
function nowStr() {
  const d = new Date();
  return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function header(doc: jsPDF, title: string, page: number, total: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Generado: ${nowStr()}`, 14, 22);
  doc.text(`Página ${page} / ${total}`, 200 - 14, 16, { align: "right" });
  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  doc.line(14, 25, 200 - 14, 25);
}

function labelValue(doc: jsPDF, label: string, value: string, x: number, y: number, w: number) {
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(label, x, y);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(value || "—", x, y + 4);
  doc.setDrawColor(235);
  doc.setLineWidth(0.2);
  doc.line(x, y + 6.5, x + w, y + 6.5);
}

function kpi(doc: jsPDF, label: string, value: string, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  doc.text(label, x + 3, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text(value, x + 3, y + 11);
}

function printTableHeader(doc: jsPDF, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const headers = [
    "Folio", "Cliente", "Domicilio cliente", "Aval", "Domicilio aval",
    "Pago", "M15", "Adeudo", "Plazo", "Vence", "Semana", "Vencida", "Desde"
  ];
  const widths = [18, 28, 36, 24, 36, 16, 10, 18, 12, 18, 14, 18, 18]; // suma aprox < 182 mm
  let x = 14;
  headers.forEach((h, i) => {
    doc.text(h, x + 1, y);
    x += widths[i];
  });
  doc.setDrawColor(210);
  doc.line(14, y + 2, 200 - 14, y + 2);
}

function printTableRows(doc: jsPDF, rows: CredLite[], startY: number) {
  const lineH = 4.2;
  const pageBottom = 287; // margen inferior
  const widths = [18, 28, 36, 24, 36, 16, 10, 18, 12, 18, 14, 18, 18];

  let y = startY;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);

  for (const r of rows) {
    if (y > pageBottom) {
      doc.addPage();
      header(doc, "Listado de créditos (cont.)", doc.getNumberOfPages(), doc.getNumberOfPages());
      y = 34;
      printTableHeader(doc, y);
      y += 4.5;
    }

    let x = 14;
    const cells = [
      r.folio,
      r.titular,
      r.domicilio_titular ?? "—",
      r.aval ?? "—",
      r.domicilio_aval ?? "—",
      money(r.cuota),
      r.tiene_m15 ? "Sí" : "No",
      money(r.adeudo_total),
      String(r.semanas),
      dateStr(r.vence_el),
      String(r.semana_actual),
      money(r.cartera_vencida),
      dateStr(r.desde_cuando),
    ];

    cells.forEach((text, i) => {
      const w = widths[i];
      // wrap simple
      const split = doc.splitTextToSize(text, w - 2);
      doc.text(split, x + 1, y);
      const used = Math.max(1, split.length);
      y += used * lineH;
      x += w;
    });

    // línea separadora
    doc.setDrawColor(240);
    doc.line(14, y + 1, 200 - 14, y + 1);
    y += 2;
  }

  return y;
}

function renderFicha(doc: jsPDF, f: FichaPayload, page: number, totalPages: number) {
  header(doc, `Ficha de población — ${f.poblacion_nombre}`, page, totalPages);

  const leftX = 16;
  const rightX = 110;
  const colW = 200 - 14 - 14 - 4;
  const halfW = (colW / 2) - 2;

  let y = 34;
  labelValue(doc, "Población", f.poblacion_nombre, leftX, y, halfW);
  labelValue(doc, "Ruta", f.ruta_nombre ?? "—", rightX, y, halfW);
  y += 12;
  labelValue(doc, "Municipio", f.municipio ?? "—", leftX, y, halfW);
  labelValue(doc, "Estado", f.estado_mx ?? "—", rightX, y, halfW);
  y += 12;
  labelValue(doc, "Frecuencia", f.frecuencia ?? "—", leftX, y, halfW);
  labelValue(doc, "Próximo pago", f.proximo_pago ? dateStr(f.proximo_pago) : "—", rightX, y, halfW);
  y += 12;
  labelValue(doc, "Coordinadora", f.coordinadora_nombre ?? "—", leftX, y, halfW);
  labelValue(doc, "Operador", f.operador_nombre ?? "—", rightX, y, halfW);

  // KPIs
  y += 14;
  const kpiW = (200 - 28 - 6) / 4;
  const kpiH = 16;
  let kx = 16;
  kpi(doc, "Créditos activos", `${f.creditos_activos}`, kx, y, kpiW, kpiH); kx += kpiW + 2;
  kpi(doc, "Cobro semanal", money(f.cobro_semanal), kx, y, kpiW, kpiH); kx += kpiW + 2;
  kpi(doc, "Cartera vencida", money(f.cartera_vencida), kx, y, kpiW, kpiH); kx += kpiW + 2;
  kpi(doc, "Ficha total", money(f.ficha_total), kx, y, kpiW, kpiH);

  // Listado
  y += kpiH + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Listado de créditos de la población", 14, y);
  y += 4.5;
  printTableHeader(doc, y);
  y += 4.5;
  const lastY = printTableRows(doc, f.creditos, y);

  // Leyendas
  const noteY = Math.min(lastY + 6, 285);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  const notes = [
    "• Pago = cuota semanal estándar.",
    "• M15 no entra en el cobro semanal; sólo se descuenta al renovar.",
    "• “Desde” = fecha de la primera cuota o fecha de creación del crédito.",
  ];
  doc.text(notes, 14, noteY);
  doc.setTextColor(0);
}

/** Genera 1 o varias fichas en un PDF. Devuelve jsPDF para descargarlo. */
export function generateReportPDF(fichas: FichaPayload[], options?: Opts) {
  const masivo = !!options?.masivo;
  const title = options?.titulo ?? (masivo ? "Reportes por población" : "Ficha de población");
  const total = Math.max(1, fichas.length);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  for (let i = 0; i < fichas.length; i++) {
    if (i > 0) doc.addPage();
    renderFicha(doc, fichas[i], i + 1, total);
  }

  doc.setProperties({
    title,
    subject: "Listado/Ficha por población",
    author: options?.autor ?? "SFGP/BACI",
    creator: "SFGP/BACI",
  });

  return doc;
}

/** Helper para descargar directamente en el navegador. */
export function downloadReportPDF(fichas: FichaPayload[], nombre: string, options?: Opts) {
  const doc = generateReportPDF(fichas, options);
  doc.save(nombre.endsWith(".pdf") ? nombre : `${nombre}.pdf`);
}
