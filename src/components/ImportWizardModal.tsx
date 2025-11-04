// src/components/ImportWizardModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  X, CheckCircle, AlertTriangle, ChevronDown, ChevronRight,
  FileSpreadsheet, Save, Loader2, Play, Bug, Clipboard, ClipboardCheck
} from "lucide-react";
import type { StageWorkbook, SheetParsed } from "../services/import/contract";
import {
  commitWorkbook,
  commitByPhase,
  type CommitReport,
  type CommitPhase,
  type CommitByPhaseResult,
  type EditableHeaderPatch
} from "../services/import/commit.engine";

/* ============== Utilidades de saneo y formato ============== */
function stripLabelPrefix(v?: string | null): string | null {
  if (!v) return null;
  let s = String(v).trim();
  const idx = s.indexOf(":");
  if (idx >= 0) {
    const left = s.slice(0, idx).trim().toLowerCase()
      .replaceAll(".", "")
      .normalize("NFD")
      // @ts-ignore
      .replace(/\p{Diacritic}/gu, "");
    const prefixes = [
      "poblacion","población","poblacion nombre","estado","ruta",
      "frecuencia","frecuencia dias","frecuencia de pago",
      "coord","coordinadora","coordinadora nombre",
      "telefono","tel","domicilio","cumple","cumpleanos","cumple coord"
    ];
    if (prefixes.some(p => left.includes(p))) {
      const right = s.slice(idx + 1).trim();
      return right.length ? right : null;
    }
  }
  const m = s.match(/^(poblaci[oó]n|poblacion|ruta|estado|coord|coordinadora|tel[eé]fono|tel|domicilio|cumplea?nos|cumple)\s*:?\s*(.+)$/i);
  if (m) return (m[2] || "").trim() || null;
  return s.length ? s : null;
}
function showClean(v?: string | null): string {
  const c = stripLabelPrefix(v);
  return (c && c.length) ? c : "-";
}
function formatMoney(n?: number | null) {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(v);
  } catch { return `$${v.toFixed(2)}`; }
}

/* ============== Normalización de encabezados (clave del fix) ============== */
/** Toma cualquier header (camelCase, snake_case o variantes) y devuelve camelCase consistente para la UI y el commit. */
function normalizeHeader(raw: any = {}) {
  // helper para tomar la primera coincidencia no vacía y limpiar prefijo tipo "Campo: valor"
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (raw[k] != null && String(raw[k]).trim().length) {
        return stripLabelPrefix(String(raw[k]));
      }
    }
    return null;
  };

  // día/mes/fecha de cumple: soporta variantes
  const dia = Number(pick("dia", "coord_cumple_dia", "cumple_dia")) || null;
  const mes = Number(pick("mes", "coord_cumple_mes", "cumple_mes")) || null;
  // fecha ISO directa si estaba
  const cumpleISO = pick("cumpleISO", "coordinadora_cumple", "coord_cumple", "cumple");

  return {
    poblacionNombre: pick("poblacionNombre", "poblacion_nombre", "población", "poblacion"),
    estadoMx:        pick("estadoMx", "poblacion_estado", "estado"),
    rutaNombre:      pick("rutaNombre", "ruta_nombre", "ruta"),
    frecuencia:      pick("frecuencia", "frecuencia_dias", "frecuencia_texto", "frecuencia_pago"),
    coordinadoraNombre:   pick("coordinadoraNombre", "coordinadora_nombre", "coordinadora"),
    coordTelefono:        pick("coordTelefono", "coordinadora_tel", "telefono", "tel"),
    coordinadoraDomicilio: pick("coordinadoraDomicilio", "coordinadora_domicilio", "domicilio"),
    dia, mes, cumpleISO
  };
}

/* ================== Tipos de UI ================== */
type Traffic = "idle" | "working" | "ok" | "warn" | "error";
type TabKey = "resumen" | "creditos" | "pagos";

/* ================== Props ================== */
type Props = {
  open: boolean;
  onClose: () => void;
  workbook: StageWorkbook;               // viene del reader
  selectedSheetNames?: string[];         // nombres elegidos previamente (opcional)
  onCommitted?: (payload: unknown) => void;
};

export default function ImportWizardModal({ open, onClose, workbook, selectedSheetNames, onCommitted }: Props) {
  // ===== Clon editable del workbook (para poder corregir encabezados antes de registrar)
  const [sheets, setSheets] = useState<SheetParsed[]>([]);
  const [tab, setTab] = useState<TabKey>("resumen");
  const [sheetIndex, setSheetIndex] = useState(0);

  // Expand en Pagos
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpand = (k: string) => setExpanded((s) => ({ ...s, [k]: !s[k] }));

  // Filtro de hojas por nombre (si vienen seleccionadas)
  const filteredSheets = useMemo(() => {
    const all = workbook?.sheets || [];
    if (!selectedSheetNames?.length) return all;
    const set = new Set(selectedSheetNames.map((x) => String(x).trim().toUpperCase()));
    return all.filter(s => set.has(s.sheetName.trim().toUpperCase()));
  }, [workbook, selectedSheetNames]);

  // Carga inicial del clon editable **con normalización de encabezados**
  useEffect(() => {
    const cloned = filteredSheets.map((s) => ({
      sheetName: s.sheetName,
      header: normalizeHeader(s.header), // ← FIX: unifica camelCase desde el inicio
      rows: s.rows.map(r => ({ ...r, pagos: r.pagos ? r.pagos.map(p => ({ ...p })) : [] })),
    }));
    setSheets(cloned);
    setSheetIndex(0);
  }, [filteredSheets]);

  const currentSheet: SheetParsed | null =
    sheets.length ? sheets[Math.max(0, Math.min(sheetIndex, sheets.length - 1))] : null;

  // Drawer de errores (reporte final)
  const [showErrors, setShowErrors] = useState(false);

  // Totales (con base al clon editable)
  const totales = useMemo(() => {
    let nCred = 0, nPagos = 0;
    for (const sh of sheets) {
      nCred += sh.rows.length;
      for (const r of sh.rows) nPagos += (r.pagos?.length || 0);
    }
    return { nHojas: sheets.length, nCreditos: nCred, nPagos };
  }, [sheets]);

  // ====== Estado de commit general (modo "Registrar todo")
  const [committing, setCommitting] = useState(false);
  const [commitProg, setCommitProg] = useState(0);
  const [commitLabel, setCommitLabel] = useState("Listo para registrar.");
  const [traffic, setTraffic] = useState<Record<CommitPhase, Traffic>>({
    Poblaciones: "idle",
    Coordinadoras: "idle",
    Clientes: "idle",
    Avales: "idle",
    "Créditos": "idle",
    Pagos: "idle",
  });
  const [finalReport, setFinalReport] = useState<CommitReport | null>(null);

  // ====== Estado de "Registrar por fase" (botonera por fase)
  const [phaseRunning, setPhaseRunning] = useState<CommitPhase | null>(null);
  const [phaseErrors, setPhaseErrors] = useState<Record<CommitPhase, string[]>>({
    Poblaciones: [], Coordinadoras: [], Clientes: [], Avales: [], "Créditos": [], Pagos: [],
  });

  // Helpers: construir Workbook editable para pasar al engine
  const editableWorkbook: StageWorkbook = useMemo(() => ({
    fileName: workbook.fileName,
    sheets,
  }), [workbook.fileName, sheets]);

  // Edición de encabezados por hoja (inputs en pestaña "Resumen")
  const patchHeader = (sheetIdx: number, patch: EditableHeaderPatch) => {
    setSheets(prev => {
      const next = [...prev];
      const s = { ...next[sheetIdx] };
      s.header = normalizeHeader({ ...s.header, ...patch }); // ← normaliza también al editar
      next[sheetIdx] = s;
      return next;
    });
  };

  const hasIssues = useMemo(() => {
    if (!finalReport) return false;
    const phases = Object.keys(finalReport.byPhase) as CommitPhase[];
    const anyBad = phases.some(p => finalReport.byPhase[p].warn > 0 || finalReport.byPhase[p].error > 0);
    const anyErr = phases.some(p => (finalReport.errorsByPhase?.[p] || []).length > 0);
    const anyWarn = phases.some(p => (finalReport.warningsByPhase?.[p] || []).length > 0);
    return anyBad || anyErr || anyWarn || !finalReport.globalOk;
  }, [finalReport]);

  // ====== Registrar TODO (en orden)
  const runCommitAll = async () => {
    if (committing) return;
    setFinalReport(null);
    setShowErrors(false);
    setCommitting(true);
    setCommitProg(2);
    setCommitLabel("Inicializando…");
    setTraffic({
      Poblaciones: "working",
      Coordinadoras: "working",
      Clientes: "working",
      Avales: "working",
      "Créditos": "working",
      Pagos: "working",
    });

    try {
      const rep = await commitWorkbook(
        editableWorkbook,
        (p, label, partial) => {
          setCommitProg(p);
          setCommitLabel(label);
          setTraffic(prev => {
            const next: Record<CommitPhase, Traffic> = { ...prev };
            (Object.keys(partial.byPhase) as CommitPhase[]).forEach((k) => {
              const sr = partial.byPhase[k];
              next[k] =
                sr.error > 0 ? "error" :
                sr.warn > 0 ? "warn" :
                sr.total === 0 ? "idle" :
                sr.done >= sr.total ? "ok" : "working";
            });
            return next;
          });
          // Guardar errores por fase en vivo
          setPhaseErrors(partial.errorsByPhase);
        }
      );

      setFinalReport(rep);
      setCommitProg(100);
      setCommitLabel(rep.globalOk ? "Registro finalizado." : "Registro finalizado con incidencias.");
      onCommitted?.(rep);
      if (!rep.globalOk) setShowErrors(true);
    } catch (e: any) {
      setCommitLabel(`Fallo: ${e?.message ?? e}`);
      setCommitProg(100);
      setTraffic({
        Poblaciones: "error",
        Coordinadoras: "error",
        Clientes: "error",
        Avales: "error",
        "Créditos": "error",
        Pagos: "error",
      });
      setShowErrors(true);
    } finally {
      setCommitting(false);
    }
  };

  // ====== Registrar SOLO una fase (botón "Registrar" por fase)
  const runPhase = async (phase: CommitPhase) => {
    if (phaseRunning) return;
    setPhaseRunning(phase);
    setPhaseErrors(prev => ({ ...prev, [phase]: [] }));
    setTraffic(prev => ({ ...prev, [phase]: "working" }));

    try {
      const res: CommitByPhaseResult = await commitByPhase(editableWorkbook, phase);
      setTraffic(prev => ({
        ...prev,
        [phase]: res.step.error > 0 ? "error" : res.step.warn > 0 ? "warn" : "ok"
      }));
      if (res.errors?.length) {
        setPhaseErrors(prev => ({ ...prev, [phase]: res.errors }));
      }
    } catch (e: any) {
      setTraffic(prev => ({ ...prev, [phase]: "error" }));
      setPhaseErrors(prev => ({
        ...prev,
        [phase]: [`${phase}: fallo inesperado → ${e?.message ?? String(e)}`],
      }));
    } finally {
      setPhaseRunning(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10060] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-[1200px] max-h-[92vh] bg-white rounded-2 border shadow-xl overflow-hidden relative">
        {/* Header */}
        <div className="h-12 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            <div className="text-[13px] font-semibold">
              Importar: <span className="opacity-70">{workbook.fileName}</span>
              {selectedSheetNames?.length ? (
                <span className="ml-2 text-[12px] opacity-60">({selectedSheetNames.length} hojas seleccionadas)</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Botón ver errores (del reporte final) */}
            <button
              className="btn-ghost !h-8 !px-3 text-xs flex items-center gap-2 disabled:opacity-50"
              type="button"
              disabled={!hasIssues}
              onClick={() => setShowErrors(true)}
              title={hasIssues ? "Ver errores y advertencias" : "Sin errores"}
            >
              <Bug className="w-4 h-4" />
              Ver errores
            </button>

            {/* Registrar TODO */}
            <button
              className="btn-primary !h-8 !px-3 text-xs disabled:opacity-60 flex items-center gap-2"
              onClick={runCommitAll}
              disabled={committing || sheets.length === 0}
              type="button"
              title="Registrar todas las fases en orden"
            >
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Registrar TODO
            </button>

            {/* Cerrar */}
            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose} type="button">
              <X className="w-4 h-4" /> Cerrar
            </button>
          </div>
        </div>

        {/* Progreso + semáforos + botonera por fase */}
        <div className="px-3 py-2 border-b">
          <div className="text-[12.5px] mb-2">{commitLabel}</div>
          <div className="w-full h-3 rounded-2 border overflow-hidden">
            <div
              className="h-full bg-[color-mix(in_oklab,var(--baci-blue),white_20%)] transition-[width] duration-200"
              style={{ width: `${Math.max(0, Math.min(100, commitProg))}%` }}
            />
          </div>

          {/* Semáforos + botón Registrar por fase (Play) */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {(["Poblaciones","Coordinadoras","Clientes","Avales","Créditos","Pagos"] as CommitPhase[]).map((k) => (
              <div key={`phase-${k}`} className="flex items-center gap-2">
                <StatusPill label={k} status={traffic[k]} />
                <button
                  type="button"
                  onClick={() => runPhase(k)}
                  disabled={!!phaseRunning}
                  className="btn-ghost !h-7 !px-2 text-[12px] flex items-center gap-1"
                  title={`Registrar solo ${k}`}
                >
                  <Play className="w-3.5 h-3.5" />
                  Registrar
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="h-10 border-b px-2 flex items-center gap-1">
          <TabButton active={tab === "resumen"} onClick={() => setTab("resumen")}>Resumen</TabButton>
          <TabButton active={tab === "creditos"} onClick={() => setTab("creditos")}>Créditos</TabButton>
          <TabButton active={tab === "pagos"} onClick={() => setTab("pagos")}>Pagos</TabButton>
        </div>

        {/* Body */}
        <div className="grid grid-rows-[auto,1fr] h-[calc(92vh-18rem)]">
          {/* Selector de hoja */}
          <div className="px-3 py-2 border-b flex items-center justify-between gap-3">
            <div className="text-[13px]">
              Hojas detectadas: <b>{totales.nHojas}</b> • Créditos: <b>{totales.nCreditos}</b> • Pagos totales: <b>{totales.nPagos}</b>
            </div>
            {sheets.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-[12.5px] opacity-70">Hoja:</label>
                <select
                  className="input !h-8 text-[12.5px]"
                  value={sheetIndex}
                  onChange={(e) => setSheetIndex(Number(e.target.value))}
                >
                  {sheets.map((s, i) => (
                    <option key={`sheet-opt-${s.sheetName}-${i}`} value={i}>
                      {s.sheetName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Contenido por TAB */}
          <div className="overflow-auto">
            {tab === "resumen" && (
              <ResumenTab
                sheets={sheets}
                onPatchHeader={patchHeader}
              />
            )}
            {tab === "creditos" && <CreditosTab sheet={currentSheet} />}
            {tab === "pagos" && (
              <PagosTab sheet={currentSheet} expanded={expanded} onToggle={toggleExpand} />
            )}
          </div>
        </div>

        {/* Panel de errores por fase (en vivo) */}
        <div className="px-3 py-2 border-t bg-[color-mix(in_oklab,white,black_2%)]">
          <div className="text-[12.5px] font-semibold mb-1">Errores por fase</div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[22vh] overflow-auto pr-1">
            {(Object.keys(phaseErrors) as CommitPhase[]).map((ph) => (
              <div key={`errs-${ph}`} className="border rounded-2 p-2">
                <div className="text-[12.5px] font-medium mb-1">{ph}</div>
                {phaseErrors[ph]?.length ? (
                  <ul className="list-disc pl-5 space-y-1 text-[12.5px]">
                    {phaseErrors[ph].map((msg, i) => (
                      <li key={`err-${ph}-${i}`} className="text-rose-700">{msg}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[12px] opacity-60">Sin errores.</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pie con resultado final */}
        {finalReport && (
          <div className="px-3 py-2 border-t text-[12.5px] flex items-center justify-between">
            <div>
              {finalReport.globalOk
                ? "Registro completado correctamente."
                : "Registro completido con incidencias. Revisa las fases marcadas en amarillo/rojo."}
            </div>
            <button
              className="btn-ghost !h-8 !px-3 text-xs flex items-center gap-2 disabled:opacity-50"
              type="button"
              disabled={!hasIssues}
              onClick={() => setShowErrors(true)}
              title={hasIssues ? "Ver errores y advertencias" : "Sin errores"}
            >
              <Bug className="w-4 h-4" />
              Ver errores
            </button>
          </div>
        )}

        {/* Drawer de errores (reporte final) */}
        <ErrorDrawer open={showErrors} onClose={() => setShowErrors(false)} report={finalReport} />
      </div>
    </div>
  );
}

/* ================== Subcomponentes ================== */

function StatusPill({ label, status }: { label: string; status: Traffic }) {
  const cls =
    status === "ok" ? "bg-green-100 text-green-800 border-green-200" :
    status === "warn" ? "bg-amber-100 text-amber-800 border-amber-200" :
    status === "error" ? "bg-rose-100 text-rose-800 border-rose-200" :
    status === "working" ? "bg-sky-100 text-sky-800 border-sky-200" :
    "bg-zinc-100 text-zinc-700 border-zinc-200";
  return (
    <div className={`text-[12px] px-2 py-1 rounded-[2px] border ${cls} grid place-items-center`}>
      {label}
    </div>
  );
}

function TabButton({ active, onClick, children }:{ active: boolean; onClick: ()=>void; children: React.ReactNode }) {
  return (
    <button
      className={[
        "px-3 h-8 text-[12.5px] rounded-[2px]",
        active
          ? "bg-[color-mix(in_oklab,var(--baci-blue),white_85%)] text-[color-mix(in_oklab,var(--baci-blue),black_10%)] font-medium"
          : "hover:bg-[color-mix(in_oklab,var(--baci-blue),white_92%)]"
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/* ================== Resumen con INPUTS EDITABLES ================== */

function ResumenTab({
  sheets,
  onPatchHeader,
}: {
  sheets: SheetParsed[];
  onPatchHeader: (sheetIdx: number, patch: EditableHeaderPatch) => void;
}) {
  return (
    <div className="p-3">
      <div className="grid gap-3">
        {sheets.map((s, i) => {
          const h: any = s.header || {};
          const nCred = s.rows.length;
          const nPagos = s.rows.reduce((acc, r) => acc + (r as any).pagos?.length || 0, 0);
          return (
            <div key={`res-${s.sheetName}-${i}`} className="border rounded-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-semibold">{s.sheetName}</div>
                <div className="text-[12.5px] opacity-70">
                  Créditos: <b>{nCred}</b> • Pagos: <b>{nPagos}</b>
                </div>
              </div>

              {/* Inputs de encabezado para correcciones rápidas */}
              <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 text-[12.5px]">
                <LabeledInput
                  label="Población"
                  value={h.poblacionNombre ?? ""}
                  onChange={(v) => onPatchHeader(i, { poblacionNombre: v })}
                />
                <LabeledInput
                  label="Municipio"
                  value={h.coordinadoraDomicilio ?? ""} // si tienes municipio dedicado, cámbialo aquí
                  onChange={(v) => onPatchHeader(i, { coordinadoraDomicilio: v })}
                />
                <LabeledInput
                  label="Estado"
                  value={h.estadoMx ?? ""}
                  onChange={(v) => onPatchHeader(i, { estadoMx: v })}
                />
                <LabeledInput
                  label="Ruta"
                  value={h.rutaNombre ?? ""}
                  onChange={(v) => onPatchHeader(i, { rutaNombre: v })}
                />
                <LabeledInput
                  label="Frecuencia (texto)"
                  value={h.frecuencia ?? ""}
                  onChange={(v) => onPatchHeader(i, { frecuencia: v })}
                />
                <LabeledInput
                  label="Coordinadora"
                  value={h.coordinadoraNombre ?? ""}
                  onChange={(v) => onPatchHeader(i, { coordinadoraNombre: v })}
                />
                <LabeledInput
                  label="Tel. coordinadora"
                  value={h.coordTelefono ?? ""}
                  onChange={(v) => onPatchHeader(i, { coordTelefono: v })}
                />
                <LabeledInput
                  label="Domicilio coordinadora"
                  value={h.coordinadoraDomicilio ?? ""}
                  onChange={(v) => onPatchHeader(i, { coordinadoraDomicilio: v })}
                />
                <LabeledInput
                  label="Cumple (día)"
                  value={String(h.dia ?? "")}
                  onChange={(v) => onPatchHeader(i, { dia: Number(v) || null })}
                  inputMode="numeric"
                />
                <LabeledInput
                  label="Cumple (mes)"
                  value={String(h.mes ?? "")}
                  onChange={(v) => onPatchHeader(i, { mes: Number(v) || null })}
                  inputMode="numeric"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LabeledInput({
  label, value, onChange, inputMode
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="border rounded-2 p-2">
      <div className="text-[11.5px] opacity-60 mb-1">{label}</div>
      <input
        className="input !h-8 w-full"
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/* ================== Créditos ================== */

function CreditosTab({ sheet }: { sheet: SheetParsed | null }) {
  if (!sheet) return <EmptyState message="No hay hoja seleccionada." />;
  return (
    <div className="p-3">
      <div className="text-[13px] font-semibold mb-2">{sheet.sheetName}</div>
      <div className="border rounded-2 overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[color-mix(in_oklab,var(--baci-blue),white_92%)]">
            <tr className="text-left">
              <Th>Folio</Th><Th>Cliente / Coord.</Th><Th>INE</Th><Th>Cuota</Th>
              <Th>Plazo</Th><Th>Vencidos</Th><Th>Car.Vencida</Th><Th>Disp.</Th><Th>#Pagos</Th><Th>Tipo</Th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r: any, idx: number) => {
              const tipo = r.es_credito_de_coordinadora ? "COORDINADORA" : "CLIENTE";
              return (
                <tr key={`cred-${sheet.sheetName}-${idx}`} className="border-t">
                  <Td>{r.folio_credito ?? "-"}</Td>
                  <Td className="max-w-[220px] truncate">{showClean(r.cliente_nombre) || showClean(r.aval_nombre)}</Td>
                  <Td>{r.cliente_ine ?? "-"}</Td>
                  <Td>{formatMoney(r.cuota)}</Td>
                  <Td>{r.plazo ?? "-"}</Td>
                  <Td>{r.vencidos ?? "-"}</Td>
                  <Td>{formatMoney(r.cartera_vencida)}</Td>
                  <Td>{r.fecha_disposicion ?? "-"}</Td>
                  <Td>{r.pagos?.length ?? 0}</Td>
                  <Td>
                    <span className={["px-2 py-0.5 rounded-[2px]", tipo === "COORDINADORA" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"].join(" ")}>
                      {tipo}
                    </span>
                  </Td>
                </tr>
              );
            })}
            {sheet.rows.length === 0 && (
              <tr><Td colSpan={10}><EmptyRow message="Sin créditos." /></Td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================== Pagos ================== */

function PagosTab({
  sheet,
  expanded,
  onToggle,
}: {
  sheet: SheetParsed | null;
  expanded: Record<string, boolean>;
  onToggle: (k: string) => void;
}) {
  if (!sheet) return <EmptyState message="No hay hoja seleccionada." />;
  const totalPagos = sheet.rows.reduce((acc, r: any) => acc + ((r.pagos?.length || 0)), 0);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[13px] font-semibold">{sheet.sheetName}</div>
        <div className="text-[12.5px] opacity-70">Pagos en hoja: <b>{totalPagos}</b></div>
      </div>

      <div className="border rounded-2 overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[color-mix(in_oklab,var(--baci-blue),white_92%)]">
            <tr className="text-left">
              <Th style={{ width: 34 }}></Th>
              <Th>Folio</Th><Th>Cliente / Coord.</Th><Th>#Pagos</Th><Th>Importe total</Th><Th>Disp.</Th><Th>Tipo</Th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r: any, idx: number) => {
              const k = `${sheet.sheetName}::${idx}`;
              const isOpen = !!expanded[k];
              const pagos = r.pagos || [];
              const total = pagos.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
              const tipo = r.es_credito_de_coordinadora ? "COORDINADORA" : "CLIENTE";

              return (
                <React.Fragment key={`payrow-${k}`}>
                  <tr className="border-t">
                    <Td>
                      <button className="btn-ghost !h-7 !px-2 text-xs" onClick={() => onToggle(k)} aria-label={isOpen ? "Colapsar" : "Expandir"} type="button">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </Td>
                    <Td>{r.folio_credito ?? "-"}</Td>
                    <Td className="max-w-[260px] truncate">{showClean(r.cliente_nombre) || showClean(r.aval_nombre)}</Td>
                    <Td>{pagos.length}</Td>
                    <Td>{formatMoney(total)}</Td>
                    <Td>{r.fecha_disposicion ?? "-"}</Td>
                    <Td>
                      <span className={["px-2 py-0.5 rounded-[2px]", tipo === "COORDINADORA" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"].join(" ")}>
                        {tipo}
                      </span>
                    </Td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-[color-mix(in_oklab,var(--baci-blue),white_96%)]">
                      <Td colSpan={7}>
                        {pagos.length === 0 ? (
                          <div className="text-[12.5px] opacity-70">Sin pagos.</div>
                        ) : (
                          <div className="overflow-auto">
                            <table className="w-full text-[12.5px]">
                              <thead><tr className="text-left"><Th style={{ width: 80 }}>#</Th><Th>Fecha</Th><Th>Importe</Th></tr></thead>
                              <tbody>
                                {pagos.map((p: any, i: number) => (
                                  <tr key={`pago-${k}-${i}`} className="border-t">
                                    <Td>{i + 1}</Td><Td>{p.fecha}</Td><Td>{formatMoney(p.monto)}</Td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {sheet.rows.length === 0 && (
              <tr><Td colSpan={7}><EmptyRow message="Sin créditos." /></Td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[12px] flex items-center gap-2 opacity-80">
        <CheckCircle className="w-4 h-4" /> Si ves fechas e importes aquí, el lector ya capturó pagos desde columnas Q en adelante.
        <span className="mx-1">|</span>
        <AlertTriangle className="w-4 h-4" /> Si alguna fecha aparece vacía, revisa los encabezados de pagos en tu XLSX.
      </div>
    </div>
  );
}

/* ============== helpers de tabla/drawer ============== */
function Th({ children, ...rest }: React.HTMLAttributes<HTMLTableCellElement>) {
  return <th className="px-2 py-2 border-b text-[12.5px]" {...rest}>{children}</th>;
}
function Td({ children, ...rest }: React.HTMLAttributes<HTMLTableCellElement>) {
  return <td className="px-2 py-2 align-top" {...rest}>{children}</td>;
}
function EmptyState({ message }: { message: string }) {
  return <div className="p-6 text-center text-[13px] opacity-70">{message}</div>;
}
function EmptyRow({ message }: { message: string }) {
  return <div className="py-4 text-center text-[12.5px] opacity-60">{message}</div>;
}

/* ================== Drawer de errores (reporte final) ================== */
function ErrorDrawer({ open, onClose, report }: {
  open: boolean;
  onClose: () => void;
  report: CommitReport | null;
}) {
  const [copied, setCopied] = useState(false);
  const phases: CommitPhase[] = ["Poblaciones","Coordinadoras","Clientes","Avales","Créditos","Pagos"];

  const textLog = useMemo(() => {
    if (!report) return "Sin reporte.";
    const lines: string[] = [];
    lines.push(`GLOBAL_OK: ${report.globalOk ? "YES" : "NO"}`);
    for (const ph of phases) {
      const s = report.byPhase[ph];
      lines.push(`[${ph}] total=${s.total} done=${s.done} ok=${s.ok} warn=${s.warn} error=${s.error}`);
      const warns = (report.warningsByPhase?.[ph] || []);
      const errs = (report.errorsByPhase?.[ph] || []);
      if (warns.length) { lines.push(`  Warnings:`); warns.forEach((w, i) => lines.push(`    - (${i + 1}) ${w}`)); }
      if (errs.length) { lines.push(`  Errors:`); errs.forEach((e, i) => lines.push(`    - (${i + 1}) ${e}`)); }
    }
    return lines.join("\n");
  }, [report]);

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(textLog);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className={["absolute top-0 right-0 h-full w-[min(520px,90vw)] bg-white border-l shadow-xl transition-transform duration-200", open ? "translate-x-0" : "translate-x-full"].join(" ")} aria-hidden={!open}>
      <div className="h-12 px-3 border-b flex items-center justify-between">
        <div className="text-[13px] font-semibold flex items-center gap-2"><Bug className="w-4 h-4" />Errores y advertencias</div>
        <div className="flex items-center gap-1">
          <button className="btn-ghost !h-8 !px-3 text-xs flex items-center gap-2" onClick={copyLog} type="button">
            {copied ? <ClipboardCheck className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}{copied ? "Copiado" : "Copiar log"}
          </button>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose} type="button"><X className="w-4 h-4" /> Cerrar</button>
        </div>
      </div>

      <div className="overflow-auto h-[calc(100%-3rem)] p-3">
        {!report && <div className="text-[12.5px] opacity-70">Aún no hay reporte.</div>}
        {report && (
          <div className="grid gap-3">
            {phases.map((ph) => {
              const s = report.byPhase[ph];
              const warns = (report.warningsByPhase?.[ph] || []);
              const errs = (report.errorsByPhase?.[ph] || []);
              const badgeCls =
                s.error > 0 ? "bg-rose-100 text-rose-800 border-rose-200" :
                s.warn > 0 ? "bg-amber-100 text-amber-800 border-amber-200" :
                "bg-emerald-100 text-emerald-800 border-emerald-200";

              return (
                <div key={`errpanel-${ph}`} className="border rounded-2">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <div className="text-[13px] font-semibold">{ph}</div>
                    <div className={`text-[11.5px] px-2 py-1 rounded-[2px] border ${badgeCls}`}>
                      ok {s.ok} • warn {s.warn} • error {s.error}
                    </div>
                  </div>

                  <div className="p-3 grid gap-3">
                    <div>
                      <div className="text-[12px] font-medium mb-1">Errores</div>
                      {errs.length === 0 ? <div className="text-[12.5px] opacity-60">Sin errores.</div> :
                        <ul className="list-disc pl-4 text-[12.5px]">{errs.map((e, i) => <li key={`e-${ph}-${i}`}>{e}</li>)}</ul>}
                    </div>
                    <div>
                      <div className="text-[12px] font-medium mb-1">Advertencias</div>
                      {warns.length === 0 ? <div className="text-[12.5px] opacity-60">Sin advertencias.</div> :
                        <ul className="list-disc pl-4 text-[12.5px]">{warns.map((w, i) => <li key={`w-${ph}-${i}`}>{w}</li>)}</ul>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
