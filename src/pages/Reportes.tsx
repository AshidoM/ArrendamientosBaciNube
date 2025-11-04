// client/src/pages/Reportes.tsx
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
function formatCurrency(n: number | null | undefined): string {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(v);
  } catch { return `$${v.toFixed(2)}`; }
}
function formatDateMX(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
const DIAS_ES = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
function formatProximoPagoLargo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dia = DIAS_ES[d.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${formatDateMX(iso)}`;
}
function todayYMD(): string { return new Date().toISOString().slice(0, 10); }

/* ====== PDF ultra compacto + badge arriba y radios 2px ====== */
function renderFichaPDF(fp: FichaPayload) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  // Márgenes y caja útil (más reducido)
  const margin = { left: 20, right: 20, top: 20, bottom: 16 } as const;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - margin.left - margin.right;

  // Título + fecha (más chico)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Ficha de población", margin.left, margin.top + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generado: ${formatDateMX(new Date().toISOString())}`, margin.left, margin.top + 18);

  // 2 columnas
  const colLeftW = usableW * 0.58;
  const colRightW = usableW - colLeftW;
  const colLeftX = margin.left;
  const colRightX = margin.left + colLeftW;

  // ---- Badge PRÓXIMO PAGO (subido y más compacto) ----
  const proxLabel = "PRÓXIMO PAGO";
  const proxText = formatProximoPagoLargo(fp.proximo_pago);

  // medidas
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const badgePadX = 9;
  const labelW = doc.getTextWidth(proxLabel);
  doc.setFontSize(10.5);
  const textW = doc.getTextWidth(proxText);
  const badgeW = Math.max(labelW, textW) + badgePadX * 2;
  const badgeH = 28;

  // pos: más arriba y pegado al borde derecho
  const badgeX = pageW - margin.right - badgeW;
  const badgeY = margin.top - 4; // <— subido

  // fondo
  doc.setDrawColor(30);
  doc.setFillColor(30);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, "F"); // radius 2px
  // texto
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(proxLabel, badgeX + badgePadX, badgeY + 10);
  doc.setFontSize(10.5);
  doc.text(proxText, badgeX + badgePadX, badgeY + 22);
  doc.setTextColor(0);

  // ---- Columna izquierda: contexto (más apretado)
  const leftStartY = margin.top + 34;
  const lineH = 12.5;

  const ctx: [string, string][] = [
    ["Población", fp.poblacion_nombre ?? "—"],
    ["Coordinadora", fp.coordinadora_nombre ?? "—"],
    ["Ruta", fp.ruta_nombre ?? "—"],
    ["Frecuencia de pagos", fp.frecuencia ?? "—"],
  ];

  let y = leftStartY;
  doc.setFontSize(9.2);
  ctx.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, colLeftX, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), colLeftX + 104, y);
    y += lineH;
  });

  // Chips (chicas)
  const chips: string[] = [];
  if (fp.municipio) chips.push(fp.municipio);
  if (fp.estado_mx) chips.push(fp.estado_mx);
  let chipX = colLeftX;
  const chipY = y + 4;
  if (chips.length) {
    doc.setFontSize(7.6);
    chips.forEach((t) => {
      const padX = 6;
      const w = doc.getTextWidth(t) + padX * 2;
      const h = 12;
      doc.setDrawColor(200); doc.setFillColor(245);
      doc.roundedRect(chipX, chipY - 10, w, h, 2, 2, "FD"); // radius 2px
      doc.text(t, chipX + padX, chipY);
      chipX += w + 6;
    });
  }

  // ---- Tarjeta KPIs (compacta y radius 2px)
  const cardX = colRightX + 6;
  const cardY = leftStartY - 10;
  const cardW = colRightW - 6;
  const cardH = 72;

  doc.setDrawColor(220); doc.setFillColor(252);
  doc.roundedRect(cardX, cardY, cardW, cardH, 2, 2, "FD"); // radius 2px

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.2);
  doc.text("Resumen", cardX + 9, cardY + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);

  const kY0 = cardY + 30;
  const kLH = 14;
  const rows: [string, string][] = [
    ["Créditos activos", String(fp.creditos_activos ?? 0)],
    ["Cobro semanal", formatCurrency(fp.cobro_semanal ?? 0)],
    ["Total cartera vencida", formatCurrency(fp.cartera_vencida ?? 0)],
    ["Ficha total", formatCurrency(fp.ficha_total ?? 0)],
    ["Operadores", fp.operador_nombre ?? "—"],
  ];

  const innerW = cardW - 18;
  const colW = innerW / 2;
  let ry = kY0;
  rows.forEach((row, idx) => {
    const cx = idx % 2 === 0 ? cardX + 9 : cardX + 9 + colW;
    if (idx % 2 !== 0) { /* derecha */ } else if (idx > 0) { ry += kLH; }
    doc.setFont("helvetica", "bold");
    doc.text(`${row[0]}:`, cx, ry);
    doc.setFont("helvetica", "normal");
    doc.text(row[1], cx + 96, ry);
  });

  // ---- Tabla (ultra compacta)
  const head = [[
    "Crédito",
    "Cliente",
    "Domicilio cliente",
    "Aval",
    "Domicilio aval",
    "Pago M15",
    "Adeudo total",
    "Plazo",
    "Vencimiento",
    "Cartera vencida",
    "Semana",
    "Desde",
    "Vence",
  ]];

  const body = fp.creditos.map((c: CredLite) => [
    c.folio, // folio (número de crédito)
    c.titular,
    c.domicilio_titular ?? "—",
    c.aval ?? "—",
    c.domicilio_aval ?? "—",
    c.tiene_m15 ? "Sí" : "No",
    formatCurrency(c.adeudo_total),
    String(c.semanas ?? 0),
    formatDateMX(c.vence_el),
    formatCurrency(c.cartera_vencida),
    `${c.semana_actual}/${c.semanas}`,
    formatDateMX(c.desde_cuando),
    formatDateMX(c.vence_el),
  ]);

  const W = usableW;
  const widths = {
    c0: W * 0.08,
    c1: W * 0.13,
    c2: W * 0.16,
    c3: W * 0.10,
    c4: W * 0.16,
    c5: W * 0.05,
    c6: W * 0.08,
    c7: W * 0.05,
    c8: W * 0.07,
    c9: W * 0.07,
    c10: W * 0.05,
    c11: W * 0.05,
    c12: W * 0.05,
  };
  const sum = Object.values(widths).reduce((a, b) => a + b, 0);
  const scale = W / sum;
  Object.keys(widths).forEach(k => (widths as any)[k] = Math.floor((widths as any)[k] * scale));

  autoTable(doc, {
    head,
    body,
    startY: cardY + cardH + 10,
    margin: { left: margin.left, right: margin.right },
    tableWidth: W,
    styles: {
      fontSize: 6.9,
      cellPadding: 1.2,
      overflow: "linebreak",
      valign: "middle",
      minCellHeight: 9.5,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      halign: "center",
      fontStyle: "bold",
      fontSize: 7.4,
    },
    columnStyles: {
      0:  { cellWidth: widths.c0 },
      1:  { cellWidth: widths.c1 },
      2:  { cellWidth: widths.c2 },
      3:  { cellWidth: widths.c3 },
      4:  { cellWidth: widths.c4 },
      5:  { cellWidth: widths.c5, halign: "center" },
      6:  { cellWidth: widths.c6, halign: "right" },
      7:  { cellWidth: widths.c7, halign: "right" },
      8:  { cellWidth: widths.c8 },
      9:  { cellWidth: widths.c9, halign: "right" },
      10: { cellWidth: widths.c10, halign: "center" },
      11: { cellWidth: widths.c11 },
      12: { cellWidth: widths.c12 },
    },
    didParseCell: (data) => {
      if (data.cell.raw && typeof data.cell.raw === "string") {
        data.cell.styles.minCellHeight = 9.5 * 2; // 2 líneas compactas
      }
    },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
      doc.text(
        `Página ${doc.internal.getNumberOfPages()}`,
        pageW - margin.right - 58,
        pageH - 7
      );
    },
    pageBreak: "auto",
    rowPageBreak: "avoid",
  });

  const safe = String(fp.poblacion_nombre || "poblacion").replace(/[\/\\:?*"<>|]/g, "_");
  doc.save(`${safe}_${todayYMD()}.pdf`);
}

/* ===== Página ===== */
export default function Reportes() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ResumenRow[]>([]);
  const [total, setTotal] = useState(0);

  // filtros
  const [rutaId, setRutaId] = useState<number | "">("");
  const [q, setQ] = useState("");

  // combos
  const [rutas, setRutas] = useState<RutaOpt[]>([]);

  // selección
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // paginación fija 5
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  useEffect(() => {
    (async () => {
      try { setRutas(await apiListRutas()); } catch (e) { console.error(e); }
    })();
  }, []);

  async function load() {
    if (!rutaId) { setRows([]); setTotal(0); return; }
    setLoading(true);
    try {
      const rutaNombre = rutas.find(r => r.id === rutaId)?.nombre;
      const { rows: data, total } = await apiResumenListado({ rutaNombre, q, from, to });
      setRows(data);
      setTotal(total);
      setSelected(s => {
        const copy = new Set<number>(s);
        const visible = new Set(data.map(r => r.poblacion_id));
        for (const id of Array.from(copy)) if (!visible.has(id)) copy.delete(id);
        return copy;
      });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rutaId, page]);

  function applyFilters() { setPage(1); load(); }
  function clearFilters() { setRutaId(""); setQ(""); setPage(1); setRows([]); setTotal(0); setSelected(new Set()); }

  // selección
  function toggleOne(id: number) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleAllPage() {
    const ids = rows.map(r => r.poblacion_id);
    const all = ids.length > 0 && ids.every(id => selected.has(id));
    setSelected(prev => {
      const s = new Set(prev);
      if (all) ids.forEach(id => s.delete(id)); else ids.forEach(id => s.add(id));
      return s;
    });
  }

  async function exportPDFsSeleccionados() {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      for (const id of Array.from(selected)) {
        const ficha = await buildFichaDePoblacion(id);
        renderFichaPDF(ficha);
      }
    } finally { setLoading(false); }
  }

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="grid gap-3 w-full" style={{ gridTemplateColumns: "minmax(220px, 320px) minmax(220px, 1fr) auto" }}>
          <div className="grid gap-1">
            <div className="text-[12px] text-muted">Ruta</div>
            <select className="input" value={rutaId} onChange={(e) => setRutaId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Selecciona una ruta…</option>
              {rutas.map(r => (<option key={r.id} value={r.id}>{r.nombre}</option>))}
            </select>
          </div>
          <div className="grid gap-1">
            <div className="text-[12px] text-muted">Buscar población (dentro de la ruta)</div>
            <input className="input" placeholder="Nombre de la población…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-2 items-end justify-end">
            <button className="btn-outline btn--sm" onClick={clearFilters}>Limpiar</button>
            <button className="btn-primary btn--sm" onClick={applyFilters} disabled={loading || !rutaId}>
              {loading ? "Cargando…" : "Aplicar"}
            </button>
            <button className="btn-primary btn--sm" onClick={exportPDFsSeleccionados} disabled={loading || selected.size === 0}>
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={rows.length > 0 && rows.every(r => selected.has(r.poblacion_id))} onChange={toggleAllPage} />
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
              <tr><td colSpan={11} className="px-3 py-6 text-center text-[13px] text-muted">
                {rutaId ? "Sin resultados." : "Selecciona una ruta y haz clic en Aplicar."}
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.poblacion_id}>
                <td><input type="checkbox" checked={selected.has(r.poblacion_id)} onChange={() => toggleOne(r.poblacion_id)} /></td>
                <td className="text-[13px]">{r.ruta ?? "—"}</td>
                <td className="text-[13px]">{r.poblacion ?? "—"}</td>
                <td className="text-[13px]">{r.coordinadora_principal ?? "—"}</td>
                <td className="text-[13px]">{r.capturista ?? "—"}</td>
                <td className="text-[13px]">{r.frecuencia_pago ?? "—"}</td>
                <td className="text-[13px]">{r.fecha_proximo_pago ? formatDateMX(r.fecha_proximo_pago) : "—"}</td>
                <td className="text-[13px] text-right">{r.creditos_activos ?? 0}</td>
                <td className="text-[13px] text-right">{formatCurrency(r.ficha_total ?? 0)}</td>
                <td className="text-[13px] text-right">{formatCurrency(r.cartera_vencida_total ?? 0)}</td>
                <td className="text-[13px] text-right">{formatCurrency(r.cobro_semanal ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer paginación 5 fijo */}
        <div className="px-3 py-2 border-top flex items-center justify-between">
          <div className="text-[12.5px] text-muted">
            {total === 0 ? "0" : `${from + 1}–${Math.min(to + 1, total)}`} de {total}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline btn--sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>{"<"} Anterior</button>
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
            <button className="btn-outline btn--sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}>Siguiente {">"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
