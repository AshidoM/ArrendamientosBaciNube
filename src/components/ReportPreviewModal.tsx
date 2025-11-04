// src/components/ReportPreviewModal.tsx
import React, { useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { type ResumenPoblacion, type DetallePoblacionRow } from "../services/reportes.service";

type Props = {
  open: boolean;
  onClose: () => void;
  resumen: ResumenPoblacion;
  detalle: DetallePoblacionRow[];
  onDownload: () => Promise<void>;
};

const PAGE_SIZE = 40;

export default function ReportPreviewModal({ open, onClose, resumen, detalle, onDownload }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);

  const total = detalle.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return detalle.slice(start, start + PAGE_SIZE);
  }, [detalle, page]);

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Previsualización de listado">
      <div className="modal-body">
        <div id="report-preview" ref={containerRef} className="report-card">
          <div className="report-head">
            <div className="report-title">Ficha de población — {resumen.poblacion}</div>
            <div className="report-subtitle">
              Ruta: {resumen.ruta ?? "—"} · Coordinadora: {resumen.coordinadora ?? "—"} · Frecuencia: {resumen.frecuencia_pago ?? "—"}
            </div>
            <div className="report-submeta">
              Fecha de generación: {fmt(resumen.fecha_generacion)}
              {resumen.fecha_proximo_pago && <> · Próximo pago: {fmt(resumen.fecha_proximo_pago)}</>}
            </div>
          </div>

          <div className="report-kpis">
            <div className="report-kpi"><div className="report-kpi__label">Créditos activos</div><div className="report-kpi__value">{resumen.creditos_activos}</div></div>
            <div className="report-kpi"><div className="report-kpi__label">Cobro semanal</div><div className="report-kpi__value">${resumen.cobro_semanal.toFixed(2)}</div></div>
            <div className="report-kpi"><div className="report-kpi__label">Cartera vencida</div><div className="report-kpi__value">${resumen.cartera_vencida_total.toFixed(2)}</div></div>
            <div className="report-kpi"><div className="report-kpi__label">Ficha total</div><div className="report-kpi__value">${resumen.ficha_total.toFixed(2)}</div></div>
            <div className="report-kpi"><div className="report-kpi__label">Operador</div><div className="report-kpi__value">{resumen.operadores ?? "—"}</div></div>
          </div>

          <div className="report-table">
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
                {total === 0 && (
                  <tr><td colSpan={14} className="text-muted">Sin créditos activos.</td></tr>
                )}
                {pageRows.map(row => {
                  const classes = [
                    row.has_vencidos ? "hl-red" : "",
                    row.has_multa_activa ? "hl-yellow" : "",
                    row.aval_repetido ? "hl-blue" : "",
                    row.es_coordinadora ? "row-bold" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <tr key={row.credito_id} className={classes}>
                      <td>{row.folio_credito ?? "—"}</td>
                      <td>{row.titular_nombre ?? "—"}</td>
                      <td>{row.titular_domicilio ?? "—"}</td>
                      <td>{row.aval_nombre ?? "—"}</td>
                      <td>{row.aval_domicilio ?? "—"}</td>
                      <td>${row.cuota.toFixed(2)}</td>
                      <td>{row.m15_activa ? "Sí" : ""}</td>
                      <td>${row.adeudo_total.toFixed(2)}</td>
                      <td>{row.plazo_semanas}</td>
                      <td>{row.vencimiento_count.toFixed(2)}</td>
                      <td>${row.cuota_vencida_monto.toFixed(2)}</td>
                      <td>${row.semana_a_cobrar.toFixed(2)}</td>
                      <td>{fmt(row.fecha_disposicion)}</td>
                      <td>{fmt(row.primer_pago)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginador visual del modal */}
          {total > PAGE_SIZE && (
            <div className="report-pager">
              <button
                className="pager-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >‹</button>
              <div className="text-sm">Página {page} de {totalPages}</div>
              <button
                className="pager-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >›</button>
            </div>
          )}

          <div className="report-legend">
            <div className="inline-flex items-center gap-2"><span className="legend-dot legend-red" /> <span>Pagos vencidos</span></div>
            <div className="inline-flex items-center gap-2"><span className="legend-dot legend-yellow" /> <span>Multa M15 activa</span></div>
            <div className="inline-flex items-center gap-2"><span className="legend-dot legend-blue" /> <span>Aval repetido</span></div>
            <div className="inline-flex items-center gap-2"><span className="legend-bold">ABC</span> <span>Coordinadora</span></div>
          </div>
        </div>
      </div>

      <div className="modal-foot">
        <div className="inline-flex gap-2">
          <button className="btn-outline btn--sm" onClick={onClose}>Cerrar</button>
          <button className="btn-primary btn--sm" onClick={onDownload} disabled={total === 0}>Descargar PDF</button>
        </div>
      </div>
    </Modal>
  );
}
