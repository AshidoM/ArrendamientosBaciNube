// src/pages/Reportes.tsx
import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  apiListRutas,
  apiResumenListado,
  buildFichaDePoblacion,
  type RutaOpt,
  type ResumenListadoRow as ResumenRow,
  type FichaPayload,
  type CredLite,
} from "../services/reportes.service";

/* ===== Helpers ===== */
function parseDateYMD(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

function toYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateMX(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dd = parseDateYMD(String(iso));
  if (!dd) return String(iso);
  const day = String(dd.getDate()).padStart(2, "0");
  const month = String(dd.getMonth() + 1).padStart(2, "0");
  const year = dd.getFullYear();
  return `${day}/${month}/${year}`;
}

const DIAS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function formatProximoPagoLargo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDateYMD(String(iso));
  if (!d) return "—";
  const dia = DIAS_ES[d.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${formatDateMX(iso)}`;
}

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

function ajustarProximoPago(iso: string | null | undefined, frecuencia: string | null | undefined): string | null {
  if (!iso) return null;
  const base = parseDateYMD(String(iso));
  if (!base) return iso;

  if (!frecuencia) return toYMD(base);
  const freq = frecuencia.trim().toLowerCase();
  const idx = DIAS_ES.indexOf(freq);
  if (idx === -1) return toYMD(base);

  const out = new Date(base);
  for (let i = 0; i < 7; i++) {
    if (out.getDay() === idx) break;
    out.setDate(out.getDate() + 1);
  }
  return toYMD(out);
}

/* ====== PDF ====== */
function renderFichaPDF(fp: FichaPayload, orientation: "landscape" | "portrait") {
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = { left: 18, right: 18, top: 16, bottom: 14 } as const;
  const usableW = pageW - margin.left - margin.right;

  const proximoAjustado = ajustarProximoPago(fp.proximo_pago, fp.frecuencia);
  const proxLabel = "PRÓXIMO PAGO";
  const proxText = formatProximoPagoLargo(proximoAjustado);

  const tituloY = margin.top + (orientation === "landscape" ? 8 : 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(orientation === "landscape" ? 16 : 13);
  doc.text("Ficha de población", margin.left, tituloY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(orientation === "landscape" ? 9 : 8);
  doc.text(
    `Generado: ${formatDateMX(new Date().toISOString().slice(0, 10))}`,
    margin.left,
    tituloY + (orientation === "landscape" ? 10 : 9)
  );

  const badgePadX = 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  const labelW = doc.getTextWidth(proxLabel);
  doc.setFontSize(9.2);
  const textW = doc.getTextWidth(proxText);
  const badgeW = Math.max(labelW, textW) + badgePadX * 2;
  const badgeH = 26;

  const badgeX = pageW - margin.right - badgeW;
  const badgeY = margin.top;

  doc.setDrawColor(30);
  doc.setFillColor(30);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, "F");
  doc.setTextColor(255);
  doc.setFontSize(6.8);
  doc.text(proxLabel, badgeX + badgePadX, badgeY + 9);
  doc.setFontSize(9.2);
  doc.text(proxText, badgeX + badgePadX, badgeY + 20);
  doc.setTextColor(0);

  const ctxStartY = badgeY + badgeH + (orientation === "landscape" ? 10 : 8);
  const lineH = orientation === "landscape" ? 13 : 10;

  const ctx: [string, string][] = [
    ["Población", fp.poblacion_nombre ?? "—"],
    ["Coordinadora", fp.coordinadora_nombre ?? "—"],
    ["Ruta", fp.ruta_nombre ?? "—"],
    ["Frecuencia de pagos", fp.frecuencia ?? "—"],
  ];

  let y = ctxStartY;
  const leftLabelW = orientation === "landscape" ? 120 : 96;

  doc.setFontSize(orientation === "landscape" ? 10 : 8.2);

  ctx.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin.left, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin.left + leftLabelW, y);
    y += lineH;
  });

  const chips: string[] = [];
  if (fp.municipio) chips.push(fp.municipio);
  if (fp.estado_mx) chips.push(fp.estado_mx);

  let chipX = margin.left;
  const chipY = y + 2;
  if (chips.length) {
    doc.setFontSize(orientation === "landscape" ? 7.6 : 6.6);
    chips.forEach((t) => {
      const padX = 6;
      const w = doc.getTextWidth(t) + padX * 2;
      const h = 11;
      doc.setDrawColor(210);
      doc.setFillColor(245);
      doc.roundedRect(chipX, chipY - 9, w, h, 2, 2, "FD");
      doc.text(t, chipX + padX, chipY);
      chipX += w + 6;
    });
  }

  // Resumen más angosto
  const cardMarginLeft = orientation === "landscape" ? 320 : 280;
  const cardX = margin.left + cardMarginLeft;
  const cardY = ctxStartY - (orientation === "landscape" ? 6 : 4);
  const cardW = pageW - margin.right - cardX;
  const cardH = orientation === "landscape" ? 74 : 66;

  doc.setDrawColor(230);
  doc.setFillColor(253);
  doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(orientation === "landscape" ? 10.5 : 9);
  doc.text("Resumen", cardX + 8, cardY + 14);

  const rowsSummary: [string, string][] = [
    ["Créditos activos", String((fp as any).credits_activos ?? fp.creditos_activos ?? 0)],
    ["Cobro semanal", formatCurrency(fp.cobro_semanal ?? 0)],
    ["Total cartera vencida", formatCurrency(fp.cartera_vencida ?? 0)],
    ["Ficha total", formatCurrency(fp.ficha_total ?? 0)],
    ["Operadores", fp.operador_nombre ?? "—"],
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(orientation === "landscape" ? 8.4 : 7.2);

  const innerW = cardW - 16;
  const colW = innerW / 2;
  let ry = cardY + 26;
  const rowGap = orientation === "landscape" ? 13 : 11;

  rowsSummary.forEach((row, idx) => {
    const cx = idx % 2 === 0 ? cardX + 8 : cardX + 8 + colW;
    if (idx % 2 === 0 && idx > 0) ry += rowGap;

    doc.setFont("helvetica", "bold");
    doc.text(`${row[0]}:`, cx, ry);
    doc.setFont("helvetica", "normal");
    doc.text(row[1], cx + 110, ry);
  });

  // Créditos ordenados por id
  const creditosOrdenados: CredLite[] = [...fp.creditos].sort((a, b) => a.id - b.id);

  // Conteo de avales para detectar aval repetido
  const avalCounts = new Map<string, number>();
  const normAval = (aval: string | null) => (aval || "").trim().toUpperCase();
  creditosOrdenados.forEach((c) => {
    const key = normAval(c.aval);
    if (!key) return;
    avalCounts.set(key, (avalCounts.get(key) || 0) + 1);
  });

  const head = [
    [
      "Crédito",
      "Cliente",
      "Domicilio cliente",
      "Aval",
      "Domicilio aval",
      "Pago",
      "Multa",
      "Adeudo total",
      "Plazo",
      "Pagos vencidos",
      "Cartera vencida",
      "Cobro semana",
      "Abonos parciales",
      "Pagos\nad.",
      "Fecha",
    ],
  ];

  const body: string[][] = [];

  creditosOrdenados.forEach((c) => {
    const cuota = Number(c.cuota || 0);
    const carteraVencida = Number(c.cartera_vencida || 0);
    const abonosParciales = Number(c.abonos_parciales || 0);
    const pagosAdelantados = Number(c.pagos_adelantados || 0);

    const pagosVencidos =
      c.pagos_vencidos ?? (cuota > 0 ? Number((carteraVencida / cuota).toFixed(2)) : 0);
    const cobroSemana =
      c.cobro_semana ?? Math.max(cuota + carteraVencida - abonosParciales, 0);

    const disponible = c.desde_cuando || null;

    body.push([
      c.folio || "",
      c.titular || "—",
      c.domicilio_titular ?? "—",
      c.aval || "—",
      c.domicilio_aval ?? "—",
      formatCurrency(cuota),
      c.tiene_m15 ? "M15" : "",
      formatCurrency(c.adeudo_total),
      `${c.semana_actual} de ${c.semanas}`,
      pagosVencidos ? String(pagosVencidos) : "0",
      formatCurrency(carteraVencida),
      formatCurrency(cobroSemana),
      abonosParciales ? formatCurrency(abonosParciales) : "—",
      String(pagosAdelantados),
      formatDateMX(disponible),
    ]);
  });

  // Reajuste de anchos
  const W = usableW;
  const widths: Record<string, number> = {
    c0: W * 0.065, // Crédito
    c1: W * 0.11, // Cliente
    c2: W * 0.15, // Dom. cliente
    c3: W * 0.09, // Aval
    c4: W * 0.14, // Dom. aval
    c5: W * 0.05, // Pago
    c6: W * 0.04, // Multa
    c7: W * 0.07, // Adeudo
    c8: W * 0.055, // Plazo
    c9: W * 0.06, // Pagos venc.
    c10: W * 0.06, // Cartera vencida
    c11: W * 0.06, // Cobro semana
    c12: W * 0.06, // Abonos parciales
    c13: W * 0.045, // Pagos ad.
    c14: W * 0.05, // Fecha
  };
  const sum = Object.values(widths).reduce((a, b) => a + b, 0);
  const scale = W / sum;
  Object.keys(widths).forEach((k) => {
    widths[k] = Math.floor(widths[k] * scale);
  });

  // Leyenda de colores (acotaciones)
  const legendItems: { color: [number, number, number]; label: string }[] = [
    { color: [255, 235, 238], label: "Créditos con M15 activa" },
    { color: [255, 249, 196], label: "Créditos con pagos vencidos / cartera vencida" },
    { color: [232, 244, 253], label: "Aval repetido en más de un crédito" },
  ];

  const legendStartY = cardY + cardH + (orientation === "landscape" ? 8 : 6);
  const legendLineH = orientation === "landscape" ? 10 : 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(orientation === "landscape" ? 7.2 : 6.3);

  legendItems.forEach((item, idx) => {
    const yLegend = legendStartY + idx * legendLineH;
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.setDrawColor(180);
    doc.rect(margin.left, yLegend - 7, 10, 6, "FD");
    doc.setTextColor(0);
    doc.text(item.label, margin.left + 14, yLegend - 2);
  });

  const tableStartY =
    legendStartY + legendItems.length * legendLineH + (orientation === "landscape" ? 4 : 3);

  autoTable(doc, {
    head,
    body,
    startY: tableStartY,
    margin: { left: margin.left, right: margin.right },
    tableWidth: W,
    styles: {
      fontSize: orientation === "landscape" ? 7 : 6,
      cellPadding: orientation === "landscape" ? 1.5 : 1.1,
      overflow: "linebreak",
      valign: "middle",
      minCellHeight: orientation === "landscape" ? 10 : 8.5,
      lineWidth: 0.2,
      halign: "center",
    },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      halign: "center",
      fontStyle: "bold",
      fontSize: orientation === "landscape" ? 7.6 : 6.5,
    },
    columnStyles: {
      0: { cellWidth: widths.c0 },
      1: { cellWidth: widths.c1, halign: "left" },
      2: { cellWidth: widths.c2, halign: "left" },
      3: { cellWidth: widths.c3, halign: "left" },
      4: { cellWidth: widths.c4, halign: "left" },
      5: { cellWidth: widths.c5 },
      6: { cellWidth: widths.c6 },
      7: { cellWidth: widths.c7 },
      8: { cellWidth: widths.c8 },
      9: { cellWidth: widths.c9 },
      10: { cellWidth: widths.c10 },
      11: { cellWidth: widths.c11 },
      12: { cellWidth: widths.c12 },
      13: { cellWidth: widths.c13 },
      14: { cellWidth: widths.c14 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const r = data.row.index;
      const cIdx = data.column.index;
      const cred = creditosOrdenados[r];
      if (!cred) return;

      // Coordinadora en negritas
      if ((cred.sujeto || "").toUpperCase() === "COORDINADORA") {
        data.cell.styles.fontStyle = "bold";
      }

      const avalKey = normAval(cred.aval);
      const avalDuplicado = avalKey && (avalCounts.get(avalKey) || 0) > 1;

      const tieneM15 = !!cred.tiene_m15;
      const pagosVencidos = Number(cred.pagos_vencidos || 0);
      const carteraVencida = Number(cred.cartera_vencida || 0);
      const tieneVencidos = pagosVencidos > 0 || carteraVencida > 0;

      // Prioridad de color:
      // 1) M15 activa (toda la fila tenue en rojo)
      // 2) Pagos vencidos / cartera vencida (celdas clave en ámbar)
      // 3) Aval repetido (columna Aval en azul suave)
      if (tieneM15) {
        data.cell.styles.fillColor = [255, 235, 238];
        if (cIdx === 6) {
          data.cell.styles.textColor = [178, 34, 34];
          data.cell.styles.fontStyle = "bold";
        }
      } else if (tieneVencidos && (cIdx === 7 || cIdx === 9 || cIdx === 10 || cIdx === 11)) {
        data.cell.styles.fillColor = [255, 249, 196];
      }

      if (avalDuplicado && cIdx === 3) {
        data.cell.styles.fillColor = [232, 244, 253];
      }
    },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text(
        `Página ${doc.internal.getNumberOfPages()}`,
        pageW - margin.right - 54,
        pageH - 6
      );
    },
    pageBreak: "auto",
    rowPageBreak: "avoid",
  });

  const safe = String(fp.poblacion_nombre || "poblacion").replace(/[\/\\:?*"<>|]/g, "_");
  doc.save(`${safe}_${todayYMD()}_${orientation}.pdf`);
}

/* ===== Página ===== */
export default function Reportes() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ResumenRow[]>([]);
  const [total, setTotal] = useState(0);

  const [rutaId, setRutaId] = useState<number | "">("");
  const [q, setQ] = useState("");

  const [rutas, setRutas] = useState<RutaOpt[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [page, setPage] = useState(1);
  const pageSize = 5;
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");

  useEffect(() => {
    (async () => {
      try {
        setRutas(await apiListRutas());
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  async function load() {
    if (!rutaId) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const rutaNombre = rutas.find((r) => r.id === rutaId)?.nombre;
      const { rows: data, total } = await apiResumenListado({ rutaNombre, q, from, to });
      setRows(data);
      setTotal(total);
      setSelected((s) => {
        const copy = new Set<number>(s);
        const visible = new Set(data.map((r) => r.poblacion_id));
        for (const id of Array.from(copy)) {
          if (!visible.has(id)) copy.delete(id);
        }
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutaId, page]);

  function applyFilters() {
    setPage(1);
    load();
  }

  function clearFilters() {
    setRutaId("");
    setQ("");
    setPage(1);
    setRows([]);
    setTotal(0);
    setSelected(new Set());
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function toggleAllPage() {
    const ids = rows.map((r) => r.poblacion_id);
    const all = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const s = new Set(prev);
      if (all) ids.forEach((id) => s.delete(id));
      else ids.forEach((id) => s.add(id));
      return s;
    });
  }

  async function exportPDFsSeleccionados() {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      for (const id of Array.from(selected)) {
        const ficha: FichaPayload = await buildFichaDePoblacion(id);
        renderFichaPDF(ficha, orientation);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dt__card">
      <div className="dt__toolbar">
        <div
          className="grid gap-3 w-full"
          style={{ gridTemplateColumns: "minmax(220px, 260px) minmax(220px, 1fr) auto auto" }}
        >
          <div className="grid gap-1">
            <div className="text-[12px] text-muted">Ruta</div>
            <select
              className="input"
              value={rutaId}
              onChange={(e) =>
                setRutaId(e.target.value ? Number(e.target.value) : ("" as const))
              }
            >
              <option value="">Selecciona una ruta…</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <div className="text-[12px] text-muted">
              Buscar población (dentro de la ruta)
            </div>
            <input
              className="input"
              placeholder="Nombre de la población…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="grid gap-1 items-end">
            <div className="text-[12px] text-muted">Orientación PDF</div>
            <select
              className="input input--sm"
              value={orientation}
              onChange={(e) =>
                setOrientation(
                  e.target.value === "portrait" ? "portrait" : "landscape"
                )
              }
            >
              <option value="landscape">Horizontal (apaisado)</option>
              <option value="portrait">Vertical</option>
            </select>
          </div>

          <div className="flex gap-2 items-end justify-end">
            <button className="btn-outline btn--sm" onClick={clearFilters}>
              Limpiar
            </button>
            <button
              className="btn-primary btn--sm"
              onClick={applyFilters}
              disabled={loading || !rutaId}
            >
              {loading ? "Cargando…" : "Aplicar"}
            </button>
            <button
              className="btn-primary btn--sm"
              onClick={exportPDFsSeleccionados}
              disabled={loading || selected.size === 0}
            >
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      <div className="table-frame overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={
                    rows.length > 0 &&
                    rows.every((r) => selected.has(r.poblacion_id))
                  }
                  onChange={toggleAllPage}
                />
              </th>
              <th>Ruta</th>
              <th>Población</th>
              <th>Coordinadora</th>
              <th>Capturista</th>
              <th>Frecuencia</th>
              <th>Próx. pago</th>
              <th className="text-right">#Activos</th>
              <th className="text-right">Ficha semanal</th>
              <th className="text-right">Cartera vencida</th>
              <th className="text-right">Cobro semanal</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-6 text-center text-[13px] text-muted"
                >
                  {rutaId
                    ? "Sin resultados."
                    : "Selecciona una ruta y haz clic en Aplicar."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.poblacion_id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.poblacion_id)}
                      onChange={() => toggleOne(r.poblacion_id)}
                    />
                  </td>
                  <td className="text-[13px]">{r.ruta ?? "—"}</td>
                  <td className="text-[13px]">{r.poblacion ?? "—"}</td>
                  <td className="text-[13px]">
                    {r.coordinadora_principal ?? "—"}
                  </td>
                  <td className="text-[13px]">{r.capturista ?? "—"}</td>
                  <td className="text-[13px]">{r.frecuencia_pago ?? "—"}</td>
                  <td className="text-[13px]">
                    {r.fecha_proximo_pago ? formatDateMX(r.fecha_proximo_pago) : "—"}
                  </td>
                  <td className="text-[13px] text-right">
                    {r.creditos_activos ?? 0}
                  </td>
                  <td className="text-[13px] text-right">
                    {formatCurrency(r.ficha_total ?? 0)}
                  </td>
                  <td className="text-[13px] text-right">
                    {formatCurrency(r.cartera_vencida_total ?? 0)}
                  </td>
                  <td className="text-[13px] text-right">
                    {formatCurrency(r.cobro_semanal ?? 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          <tfoot></tfoot>
        </table>

        <div className="px-3 py-2 border-top flex items-center justify-between">
          <div className="text-[12.5px] text-muted">
            {total === 0 ? "0" : `${from + 1}–${Math.min(to + 1, total)}`} de {total}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-outline btn--sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
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

            <button
              className="btn-outline btn--sm"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
            >
              Siguiente {">"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Dinero ===== */
function formatCurrency(n: number | null | undefined): string {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}
