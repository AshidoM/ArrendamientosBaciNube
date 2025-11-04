// src/lib/pdf.ts
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { getListadoPoblacion, type ResumenPoblacion, type DetallePoblacionRow } from "../services/reportes.service";
import { withRetry } from "./retry";

function buildReportDOM(resumen: ResumenPoblacion, detalle: DetallePoblacionRow[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "900px";
  wrapper.style.background = "#fff";
  wrapper.className = "report-card";

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
  const money = (n: number) => `$${n.toFixed(2)}`;

  wrapper.innerHTML = `
    <div class="report-head">
      <div class="report-title">Ficha de población — ${resumen.poblacion}</div>
      <div class="report-subtitle">
        Ruta: ${resumen.ruta ?? "—"} · Coordinadora: ${resumen.coordinadora ?? "—"} · Frecuencia: ${resumen.frecuencia_pago ?? "—"}
      </div>
      <div class="report-submeta">
        Fecha de generación: ${fmt(resumen.fecha_generacion)}${resumen.fecha_proximo_pago ? " · Próximo pago: " + fmt(resumen.fecha_proximo_pago) : ""}
      </div>
    </div>

    <div class="report-kpis">
      <div class="report-kpi"><div class="report-kpi__label">Créditos activos</div><div class="report-kpi__value">${resumen.creditos_activos}</div></div>
      <div class="report-kpi"><div class="report-kpi__label">Cobro semanal</div><div class="report-kpi__value">${money(resumen.cobro_semanal)}</div></div>
      <div class="report-kpi"><div class="report-kpi__label">Cartera vencida</div><div class="report-kpi__value">${money(resumen.cartera_vencida_total)}</div></div>
      <div class="report-kpi"><div class="report-kpi__label">Ficha total</div><div class="report-kpi__value">${money(resumen.ficha_total)}</div></div>
      <div class="report-kpi"><div class="report-kpi__label">Operador</div><div class="report-kpi__value">${resumen.operadores ?? "—"}</div></div>
    </div>

    <div class="report-table">
      <table>
        <thead>
          <tr>
            <th>Crédito</th>
            <th>Titular</th>
            <th>Domicilio</th>
            <th>Aval</th>
            <th>Domicilio aval</th>
            <th>Cuota</th>
            <th>M15</th>
            <th>Adeudo</th>
            <th>Plazo</th>
            <th>Vencimiento</th>
            <th>Cuota vencida</th>
            <th>Semana</th>
            <th>Disponible</th>
            <th>Primer pago</th>
          </tr>
        </thead>
        <tbody>
          ${detalle.map(row => {
            const classes = [
              row.has_vencidos ? "hl-red" : "",
              row.has_multa_activa ? "hl-yellow" : "",
              row.aval_repetido ? "hl-blue" : "",
              row.es_coordinadora ? "row-bold" : "",
            ].filter(Boolean).join(" ");
            return `
              <tr class="${classes}">
                <td>${row.folio_credito ?? "—"}</td>
                <td>${row.titular_nombre ?? "—"}</td>
                <td>${row.titular_domicilio ?? "—"}</td>
                <td>${row.aval_nombre ?? "—"}</td>
                <td>${row.aval_domicilio ?? "—"}</td>
                <td>${money(row.cuota)}</td>
                <td>${row.m15_activa ? "Sí" : ""}</td>
                <td>${money(row.adeudo_total)}</td>
                <td>${row.plazo_semanas}</td>
                <td>${row.vencimiento_count.toFixed(2)}</td>
                <td>${money(row.cuota_vencida_monto)}</td>
                <td>${money(row.semana_a_cobrar)}</td>
                <td>${fmt(row.fecha_disposicion)}</td>
                <td>${fmt(row.primer_pago)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>

    <div class="report-legend" style="margin-top:10px;">
      <div class="inline-flex items-center gap-2"><span class="legend-dot legend-red"></span> <span>Pagos vencidos</span></div>
      <div class="inline-flex items-center gap-2"><span class="legend-dot legend-yellow"></span> <span>Multa M15 activa</span></div>
      <div class="inline-flex items-center gap-2"><span class="legend-dot legend-blue"></span> <span>Aval repetido</span></div>
      <div class="inline-flex items-center gap-2"><span class="legend-bold">ABC</span> <span>Coordinadora</span></div>
    </div>
  `;
  document.body.appendChild(wrapper);
  return wrapper;
}

async function htmlToPDF(element: HTMLElement, fileName: string) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: element.clientWidth,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth - 40;
  const ratio = canvas.height / canvas.width;
  const imgHeight = imgWidth * ratio;

  let y = 20;
  let remaining = imgHeight;
  let srcY = 0;
  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d")!;

  while (remaining > 0) {
    const sliceHeight = Math.min(pageHeight - 40, remaining);
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.floor(sliceHeight * (canvas.width / imgWidth));
    pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageCtx.drawImage(
      canvas,
      0, Math.floor(srcY * (canvas.width / imgWidth)),
      canvas.width, pageCanvas.height,
      0, 0,
      pageCanvas.width, pageCanvas.height
    );
    const sliceData = pageCanvas.toDataURL("image/png");
    if (y !== 20) pdf.addPage();
    pdf.addImage(sliceData, "PNG", 20, 20, imgWidth, sliceHeight, undefined, "FAST");
    remaining -= sliceHeight;
    srcY += sliceHeight;
    y = 0;
  }

  pdf.save(fileName);
}

function nombreArchivo(resumen: ResumenPoblacion) {
  const ymd = new Date(resumen.fecha_generacion).toISOString().slice(0,10);
  const limpio = (resumen.poblacion || "Poblacion").replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
  return `Listado_${limpio}_${ymd}.pdf`;
}

export async function downloadListadoPDF(resumen: ResumenPoblacion, detalle: DetallePoblacionRow[]) {
  const dom = buildReportDOM(resumen, detalle);
  try {
    await withRetry(() => htmlToPDF(dom, nombreArchivo(resumen)), 2, 350);
  } finally {
    dom.remove();
  }
}

export async function downloadListadoMasivo(
  poblacionIds: number[],
  onProgress?: (done: number, total: number) => void
) {
  const ids = poblacionIds.slice(0, 20);
  const total = ids.length;
  let done = 0;

  const worker = async (id: number) => {
    const datos = await withRetry(() => getListadoPoblacion(id), 3, 400);
    const dom = buildReportDOM(datos.resumen, datos.detalle);
    try {
      await withRetry(() => htmlToPDF(dom, nombreArchivo(datos.resumen)), 2, 350);
    } finally {
      dom.remove();
      done++;
      onProgress?.(done, total);
    }
  };

  const concurrency = 2;
  const queue = [...ids];
  const runners: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    const run = (async function loop() {
      while (queue.length) {
        const next = queue.shift()!;
        await worker(next);
      }
    })();
    runners.push(run);
  }
  await Promise.all(runners);
}
