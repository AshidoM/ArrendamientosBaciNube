// src/services/import/commit.engine.ts
import { supabase } from "../../lib/supabase";
import type { StageWorkbook, StageSheet, SheetParsed, RegistroCreditoRow } from "./contract";

/* =========================
   Tipos de reporte/etapas
========================= */
export type CommitPhase =
  | "Poblaciones"
  | "Coordinadoras"
  | "Clientes"
  | "Avales"
  | "Créditos"
  | "Pagos";

export type StepReport = {
  phase: CommitPhase;
  total: number;
  done: number;
  ok: number;
  warn: number;
  error: number;
};

export type CommitReport = {
  byPhase: Record<CommitPhase, StepReport>;
  errorsByPhase: Record<CommitPhase, string[]>;
  globalOk: boolean;
};

export type CommitByPhaseResult = {
  step: StepReport;
  errors: string[];
};

export type EditableHeaderPatch = Partial<SheetParsed["header"]>;

/* =========================
   Normalizadores
========================= */
function norm(v?: string | null): string | null {
  if (!v) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}
function upp(v?: string | null, fallback = "-"): string {
  const n = norm(v);
  return (n ?? fallback).toUpperCase();
}
function toDateISO(s?: string | null): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // aceptar ya ISO o dd/mm/yyyy
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    const d = m2[1].padStart(2, "0");
    const mo = m2[2].padStart(2, "0");
    const y = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${y}-${mo}-${d}`;
  }
  return t; // lo que venga
}

/* =========================
   Ensures básicos
========================= */
async function ensureRuta(rutaNombre?: string | null): Promise<number | null> {
  const nombre = upp(rutaNombre, "SIN RUTA");
  if (!nombre) return null;

  const { data: ex, error: efind } = await supabase
    .from("rutas")
    .select("id")
    .eq("nombre", nombre)
    .limit(1)
    .maybeSingle();
  if (efind) throw efind;

  if (ex?.id) return ex.id;

  const { data: ins, error: eins } = await supabase
    .from("rutas")
    .insert([{ nombre, estado: "ACTIVO" }])
    .select("id");
  if (eins) throw eins;

  return ins?.[0]?.id ?? null;
}

async function ensurePoblacion(opts: {
  poblacion_nombre?: string | null;
  poblacion_municipio?: string | null; // si manejas municipio en header aparte, cámbialo aquí
  poblacion_estado?: string | null;
  ruta_id?: number | null;
}): Promise<number | null> {
  const nombre = upp(opts.poblacion_nombre, "SIN POBLACIÓN");
  const municipio = upp(opts.poblacion_municipio, "SIN MUNICIPIO"); // ajusta si tienes columna municipio real
  const estado_mx = upp(opts.poblacion_estado, "SIN ESTADO");

  const { data: ex, error: efind } = await supabase
    .from("poblaciones")
    .select("id")
    .eq("nombre", nombre)
    .eq("municipio", municipio)
    .eq("estado_mx", estado_mx)
    .limit(1)
    .maybeSingle();
  if (efind) throw efind;

  if (ex?.id) return ex.id;

  const payload = { nombre, municipio, estado_mx, ruta_id: opts.ruta_id ?? null, estado: "ACTIVO" };
  const { data: ins, error: eins } = await supabase
    .from("poblaciones")
    .insert([payload])
    .select("id");
  if (eins) throw eins;

  return ins?.[0]?.id ?? null;
}

async function ensureCoordinadora(opts: {
  nombre?: string | null;
  poblacion_id?: number | null;
  ine?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}): Promise<number | null> {
  const nombre = upp(opts.nombre, "");
  if (!nombre) return null;

  // identidad por nombre + poblacion (ajusta a tu preferencia)
  const { data: ex, error: efind } = await supabase
    .from("coordinadoras")
    .select("id")
    .eq("nombre", nombre)
    .eq("poblacion_id", opts.poblacion_id ?? null)
    .limit(1)
    .maybeSingle();
  if (efind) throw efind;

  if (ex?.id) return ex.id;

  const { data: ins, error: eins } = await supabase
    .from("coordinadoras")
    .insert([{
      nombre,
      ine: norm(opts.ine),
      telefono: norm(opts.telefono),
      direccion: norm(opts.direccion),
      poblacion_id: opts.poblacion_id ?? null,
      estado: "ACTIVO"
    }])
    .select("id");
  if (eins) throw eins;

  return ins?.[0]?.id ?? null;
}

async function ensureAval(opts: {
  nombre?: string | null;
  ine?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}): Promise<number | null> {
  const nombre = upp(opts.nombre, "");
  if (!nombre) return null;

  // identidad por ine si hay; si no, por nombre
  if (norm(opts.ine)) {
    const { data: exIne, error: ef1 } = await supabase
      .from("avales")
      .select("id")
      .eq("ine", norm(opts.ine))
      .limit(1)
      .maybeSingle();
    if (ef1) throw ef1;
    if (exIne?.id) return exIne.id;
  }

  const { data: ex, error: efind } = await supabase
    .from("avales")
    .select("id")
    .eq("nombre", nombre)
    .limit(1)
    .maybeSingle();
  if (efind) throw efind;

  if (ex?.id) return ex.id;

  const { data: ins, error: eins } = await supabase
    .from("avales")
    .insert([{
      nombre,
      ine: norm(opts.ine),
      telefono: norm(opts.telefono),
      direccion: norm(opts.direccion),
      estado: "ACTIVO"
    }])
    .select("id");
  if (eins) throw eins;

  return ins?.[0]?.id ?? null;
}

async function ensureCliente(opts: {
  nombre?: string | null;
  ine?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  poblacion_id: number | null;
  aval_id?: number | null;
}): Promise<number | null> {
  const nombre = upp(opts.nombre, "");
  if (!nombre) return null;

  // identidad por INE si hay; si no, por nombre + poblacion
  if (norm(opts.ine)) {
    const { data: exIne, error: ef1 } = await supabase
      .from("clientes")
      .select("id")
      .eq("ine", norm(opts.ine))
      .limit(1)
      .maybeSingle();
    if (ef1) throw ef1;
    if (exIne?.id) return exIne.id;
  }

  const { data: ex, error: efind } = await supabase
    .from("clientes")
    .select("id")
    .eq("nombre", nombre)
    .eq("poblacion_id", opts.poblacion_id ?? null)
    .limit(1)
    .maybeSingle();
  if (efind) throw efind;

  if (ex?.id) return ex.id;

  const { data: ins, error: eins } = await supabase
    .from("clientes")
    .insert([{
      nombre,
      poblacion_id: opts.poblacion_id,
      ine: norm(opts.ine),
      telefono: norm(opts.telefono),
      direccion: norm(opts.direccion),
      estado: "ACTIVO"
    }])
    .select("id");
  if (eins) throw eins;

  const newId = ins?.[0]?.id ?? null;

  // Vincular aval si viene
  if (newId && (opts.aval_id ?? null)) {
    await supabase
      .from("cliente_avales")
      .upsert([{ cliente_id: newId, aval_id: opts.aval_id! }], { onConflict: "cliente_id,aval_id" });
  }

  return newId;
}

/* =========================
   Utilidades de créditos/pagos
========================= */
async function findPlanId(sujeto: "CLIENTE" | "COORDINADORA", semanas: number | null | undefined): Promise<number | null> {
  if (!semanas || semanas <= 0) return null;
  const { data, error } = await supabase
    .from("planes")
    .select("id")
    .eq("semanas", semanas)
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null; // si tu tabla requiere (sujeto+semanas) añade .eq("sujeto", sujeto)
}

function n2(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* =========================
   Fases: cada una devuelve errores detallados
========================= */

// 1) POBLACIONES
export async function commitPoblaciones(
  workbook: StageWorkbook,
  onTick?: (done: number, total: number) => void
): Promise<string[]> {
  const sheets = workbook.sheets || [];
  const total = sheets.length || 1;
  let done = 0;
  const errors: string[] = [];

  for (const s of sheets) {
    try {
      const rutaId = await ensureRuta(s.header.rutaNombre);
      await ensurePoblacion({
        poblacion_nombre: s.header.poblacionNombre,
        poblacion_municipio: s.header.coordinadoraDomicilio /* si tienes municipio dedícalo */,
        poblacion_estado: s.header.estadoMx,
        ruta_id: rutaId,
      });
    } catch (e: any) {
      errors.push(`[${s.sheetName}] No se pudo crear/asegurar población: ${e?.message ?? e}`);
    } finally {
      done++; onTick?.(done, total);
    }
  }
  return errors;
}

// 2) COORDINADORAS
async function commitCoordinadoras(
  wb: StageWorkbook,
  onTick?: (d: number, t: number) => void
): Promise<string[]> {
  const sheets = wb.sheets || [];
  const elegibles = sheets.filter(s => !!s.header.coordinadoraNombre);
  const total = elegibles.length || 1;
  let done = 0;
  const errors: string[] = [];

  for (const s of elegibles) {
    try {
      const rutaId = await ensureRuta(s.header.rutaNombre);
      const poblacionId = await ensurePoblacion({
        poblacion_nombre: s.header.poblacionNombre,
        poblacion_municipio: s.header.coordinadoraDomicilio,
        poblacion_estado: s.header.estadoMx,
        ruta_id: rutaId,
      });

      await ensureCoordinadora({
        nombre: s.header.coordinadoraNombre,
        poblacion_id: poblacionId,
        telefono: s.header.coordTelefono,
        direccion: s.header.coordinadoraDomicilio,
      });
    } catch (e: any) {
      errors.push(`[${s.sheetName}] Coordinadora no registrada: ${e?.message ?? e}`);
    } finally {
      done++; onTick?.(done, total);
    }
  }
  return errors;
}

// 3) CLIENTES (y vincular aval si aplica)
async function commitClientes(
  wb: StageWorkbook,
  onTick?: (d: number, t: number) => void
): Promise<string[]> {
  const sheets = wb.sheets || [];
  const rows = sheets.flatMap(s => s.rows.map(r => ({ sheetName: s.sheetName, header: s.header, r })));
  const onlyClients = rows.filter(x => !x.r.es_credito_de_coordinadora);
  const total = onlyClients.length || 1;
  let done = 0;
  const errors: string[] = [];

  for (const row of onlyClients) {
    try {
      const rutaId = await ensureRuta(row.header.rutaNombre);
      const poblacionId = await ensurePoblacion({
        poblacion_nombre: row.header.poblacionNombre,
        poblacion_municipio: row.header.coordinadoraDomicilio,
        poblacion_estado: row.header.estadoMx,
        ruta_id: rutaId,
      });

      const avalId = await ensureAval({
        nombre: row.r.aval_nombre,
        ine: row.r.aval_ine,
        direccion: row.r.aval_dom,
      });

      await ensureCliente({
        nombre: row.r.cliente_nombre,
        ine: row.r.cliente_ine,
        direccion: row.r.cliente_dom,
        poblacion_id: poblacionId,
        aval_id: avalId ?? undefined,
      });
    } catch (e: any) {
      errors.push(`[${row.sheetName}] Cliente "${row.r.cliente_nombre ?? "-"}" no registrado: ${e?.message ?? e}`);
    } finally {
      done++; onTick?.(done, total);
    }
  }
  return errors;
}

// 4) AVALES (para coordinadora u otros registros sueltos)
async function commitAvales(
  wb: StageWorkbook,
  onTick?: (d: number, t: number) => void
): Promise<string[]> {
  const sheets = wb.sheets || [];
  const rows = sheets.flatMap(s => s.rows.map(r => ({ sheetName: s.sheetName, r })));
  const onlyWithAval = rows.filter(x => !!x.r.aval_nombre);
  const total = onlyWithAval.length || 1;
  let done = 0;
  const errors: string[] = [];

  for (const row of onlyWithAval) {
    try {
      await ensureAval({
        nombre: row.r.aval_nombre,
        ine: row.r.aval_ine,
        direccion: row.r.aval_dom,
      });
    } catch (e: any) {
      errors.push(`[${row.sheetName}] Aval "${row.r.aval_nombre ?? "-"}" no registrado: ${e?.message ?? e}`);
    } finally {
      done++; onTick?.(done, total);
    }
  }
  return errors;
}

// 5) CRÉDITOS (inserción real con validaciones mínimas)
async function commitCreditos(
  wb: StageWorkbook,
  onTick?: (d: number, t: number) => void
): Promise<{ errors: string[]; creditoIdsByRow: Map<string, number> }> {
  const sheets = wb.sheets || [];
  const rows = sheets.flatMap((s, si) => s.rows.map((r, ri) => ({ s, si, r, ri })));
  const total = rows.length || 1;
  let done = 0;
  const errors: string[] = [];
  const creditoIdsByRow = new Map<string, number>(); // key = `${si}:${ri}`

  for (const it of rows) {
    const key = `${it.si}:${it.ri}`;
    try {
      const sujeto: "CLIENTE" | "COORDINADORA" = it.r.es_credito_de_coordinadora ? "COORDINADORA" : "CLIENTE";
      const semanas = n2(it.r.plazo);
      const cuota = n2(it.r.cuota);
      const fechaDisp = toDateISO(it.r.fecha_disposicion) ?? new Date().toISOString().slice(0,10);

      if (!semanas || semanas <= 0) {
        errors.push(`[${it.s.sheetName}] Crédito fila #${it.ri+1}: semanas/plazo inválido.`);
        continue;
      }
      if (!cuota || cuota <= 0) {
        errors.push(`[${it.s.sheetName}] Crédito fila #${it.ri+1}: cuota inválida.`);
        continue;
      }

      const planId = await findPlanId(sujeto, semanas);
      if (!planId) {
        errors.push(`[${it.s.sheetName}] Crédito fila #${it.ri+1}: plan no encontrado (semanas=${semanas}).`);
        continue;
      }

      const rutaId = await ensureRuta(it.s.header.rutaNombre);
      const poblacionId = await ensurePoblacion({
        poblacion_nombre: it.s.header.poblacionNombre,
        poblacion_municipio: it.s.header.coordinadoraDomicilio,
        poblacion_estado: it.s.header.estadoMx,
        ruta_id: rutaId,
      });

      // titular
      let cliente_id: number | null = null;
      let coordinadora_id: number | null = null;

      if (sujeto === "CLIENTE") {
        cliente_id = await ensureCliente({
          nombre: it.r.cliente_nombre,
          ine: it.r.cliente_ine,
          direccion: it.r.cliente_dom,
          poblacion_id: poblacionId,
        });
        if (!cliente_id) {
          errors.push(`[${it.s.sheetName}] Crédito fila #${it.ri+1}: no se pudo asegurar cliente.`);
          continue;
        }
      } else {
        coordinadora_id = await ensureCoordinadora({
          nombre: it.s.header.coordinadoraNombre,
          poblacion_id: poblacionId,
          telefono: it.s.header.coordTelefono,
          direccion: it.s.header.coordinadoraDomicilio,
        });
        if (!coordinadora_id) {
          errors.push(`[${it.s.sheetName}] Crédito fila #${it.ri+1}: no se pudo asegurar coordinadora.`);
          continue;
        }
      }

      // monto_principal aproximado: cuota * semanas (puedes ajustar a tu fórmula)
      const monto_principal = Number((cuota || 0) * (semanas || 0));
      const cuota_semanal = cuota!;
      const papeleria = 0;

      const { data: ins, error: eins } = await supabase
        .from("creditos")
        .insert([{
          sujeto,
          cliente_id,
          coordinadora_id,
          poblacion_id: poblacionId,
          ruta_id: rutaId,
          plan_id: planId,
          semanas,
          monto_principal,
          cuota_semanal,
          papeleria_aplicada: papeleria,
          fecha_disposicion: fechaDisp,
          observaciones: it.r.observaciones ?? null,
        }])
        .select("id");
      if (eins) throw eins;

      const credId = ins?.[0]?.id;
      if (!credId) {
        errors.push(`[${it.s.sheetName}] Crédito fila #${it.ri+1}: insert devolvió sin id.`);
        continue;
      }
      creditoIdsByRow.set(key, credId);
    } catch (e: any) {
      errors.push(`[${it.s.sheetName}] Crédito fila #${it.ri+1}: ${e?.message ?? e}`);
    } finally {
      done++; onTick?.(done, total);
    }
  }

  return { errors, creditoIdsByRow };
}

// 6) PAGOS (encabezado simple ligado al crédito)
async function commitPagos(
  wb: StageWorkbook,
  creditoIdsByRow: Map<string, number>,
  onTick?: (d: number, t: number) => void
): Promise<string[]> {
  const sheets = wb.sheets || [];
  const indexables = sheets.flatMap((s, si) => s.rows.map((r, ri) => ({ s, si, r, ri })));
  const total = indexables.reduce((a, it) => a + (it.r.pagos?.length || 0), 0) || 1;
  let done = 0;
  const errors: string[] = [];

  for (const it of indexables) {
    const key = `${it.si}:${it.ri}`;
    const credId = creditoIdsByRow.get(key);
    const pagos = it.r.pagos || [];
    if (!credId) {
      if (pagos.length) {
        errors.push(`[${it.s.sheetName}] Pagos fila #${it.ri+1}: no hay crédito asociado (se omitieron ${pagos.length}).`);
      }
      continue;
    }

    for (const p of pagos) {
      try {
        const fecha = toDateISO(p.fecha) ?? new Date().toISOString();
        const monto = n2(p.monto) ?? 0;
        const { error: eins } = await supabase
          .from("pagos")
          .insert([{
            credito_id: credId,
            fecha,           // si tu tabla usa fecha_pago/fecha, ajusta; aquí cargo en ambos
            fecha_pago: fecha,
            total: monto,
            monto,           // si se usa
          }]);
        if (eins) throw eins;
      } catch (e: any) {
        errors.push(`[${it.s.sheetName}] Pago fila #${it.ri+1}: ${e?.message ?? e}`);
      } finally {
        done++; onTick?.(done, total);
      }
    }
  }

  return errors;
}

/* =========================
   Progreso y conteos
========================= */
function emptyStep(phase: CommitPhase, total: number): StepReport {
  return { phase, total, done: 0, ok: 0, warn: 0, error: 0 };
}
function progressFromReport(rep: CommitReport): number {
  const phases: CommitPhase[] = ["Poblaciones", "Coordinadoras", "Clientes", "Avales", "Créditos", "Pagos"];
  const totals = phases.reduce((a, k) => a + rep.byPhase[k].total, 0) || 1;
  const done = phases.reduce((a, k) => a + rep.byPhase[k].done, 0);
  return Math.round((done / totals) * 100);
}

/* =========================
   Orquestador completo (Registrar TODO)
========================= */
export async function commitWorkbook(
  workbook: StageWorkbook,
  onProgress?: (percent: number, label: string, partial: CommitReport) => void
): Promise<CommitReport> {
  const sheets = workbook.sheets || [];

  const counts = {
    Poblaciones: sheets.length,
    Coordinadoras: sheets.filter(s => !!s.header.coordinadoraNombre).length,
    Clientes: sheets.reduce((a, s) => a + s.rows.filter(r => !r.es_credito_de_coordinadora).length, 0),
    Avales: sheets.reduce((a, s) => a + s.rows.filter(r => !!r.aval_nombre).length, 0),
    "Créditos": sheets.reduce((a, s) => a + s.rows.length, 0),
    Pagos: sheets.reduce((a, s) => a + s.rows.reduce((b, r) => b + (r.pagos?.length || 0), 0), 0),
  };

  const report: CommitReport = {
    byPhase: {
      Poblaciones: emptyStep("Poblaciones", counts.Poblaciones),
      Coordinadoras: emptyStep("Coordinadoras", counts.Coordinadoras),
      Clientes: emptyStep("Clientes", counts.Clientes),
      Avales: emptyStep("Avales", counts.Avales),
      "Créditos": emptyStep("Créditos", counts["Créditos"]),
      Pagos: emptyStep("Pagos", counts.Pagos),
    },
    errorsByPhase: {
      Poblaciones: [],
      Coordinadoras: [],
      Clientes: [],
      Avales: [],
      "Créditos": [],
      Pagos: [],
    },
    globalOk: true,
  };

  const setDoneOk = (phase: CommitPhase, done: number, total?: number) => {
    const s = report.byPhase[phase];
    s.done = done;
    if (total != null) s.total = total;
    s.ok = done;
    onProgress?.(progressFromReport(report), `Registrando ${phase.toLowerCase()}… (${s.done}/${s.total})`, report);
  };
  const pushErrors = (phase: CommitPhase, errs: string[]) => {
    if (errs?.length) {
      report.errorsByPhase[phase].push(...errs);
      const s = report.byPhase[phase];
      s.error += errs.length;
      report.globalOk = false;
      onProgress?.(progressFromReport(report), `Errores en ${phase.toLowerCase()} (${s.error})…`, report);
    }
  };

  // 1) Poblaciones
  onProgress?.(progressFromReport(report), "Creando poblaciones…", report);
  try {
    let done = 0;
    const errs = await commitPoblaciones(workbook, (d) => { done = d; setDoneOk("Poblaciones", done); });
    pushErrors("Poblaciones", errs);
  } catch (e) {
    pushErrors("Poblaciones", [`Fallo general: ${String(e)}`]);
  }

  // 2) Coordinadoras
  onProgress?.(progressFromReport(report), "Creando coordinadoras…", report);
  try {
    let done = 0;
    const errs = await commitCoordinadoras(workbook, (d, _t) => { done = d; setDoneOk("Coordinadoras", done); });
    pushErrors("Coordinadoras", errs);
  } catch (e) {
    pushErrors("Coordinadoras", [`Fallo general: ${String(e)}`]);
  }

  // 3) Clientes
  onProgress?.(progressFromReport(report), "Creando clientes…", report);
  try {
    let done = 0;
    const errs = await commitClientes(workbook, (d, _t) => { done = d; setDoneOk("Clientes", done); });
    pushErrors("Clientes", errs);
  } catch (e) {
    pushErrors("Clientes", [`Fallo general: ${String(e)}`]);
  }

  // 4) Avales
  onProgress?.(progressFromReport(report), "Creando avales…", report);
  try {
    let done = 0;
    const errs = await commitAvales(workbook, (d, _t) => { done = d; setDoneOk("Avales", done); });
    pushErrors("Avales", errs);
  } catch (e) {
    pushErrors("Avales", [`Fallo general: ${String(e)}`]);
  }

  // 5) Créditos
  onProgress?.(progressFromReport(report), "Generando créditos…", report);
  let creditMap = new Map<string, number>();
  try {
    let done = 0;
    const res = await commitCreditos(workbook, (d, _t) => { done = d; setDoneOk("Créditos", done); });
    creditMap = res.creditoIdsByRow;
    pushErrors("Créditos", res.errors);
  } catch (e) {
    pushErrors("Créditos", [`Fallo general: ${String(e)}`]);
  }

  // 6) Pagos
  onProgress?.(progressFromReport(report), "Aplicando pagos…", report);
  try {
    let done = 0;
    const errs = await commitPagos(workbook, creditMap, (d, _t) => { done = d; setDoneOk("Pagos", done); });
    pushErrors("Pagos", errs);
  } catch (e) {
    pushErrors("Pagos", [`Fallo general: ${String(e)}`]);
  }

  onProgress?.(100, "Finalizado.", report);
  return report;
}

/* =========================
   Registrar SOLO una fase (para la botonera)
========================= */
export async function commitByPhase(wb: StageWorkbook, phase: CommitPhase): Promise<CommitByPhaseResult> {
  const counts = {
    Poblaciones: (wb.sheets || []).length,
    Coordinadoras: (wb.sheets || []).filter(s => !!s.header.coordinadoraNombre).length,
    Clientes: (wb.sheets || []).reduce((a, s) => a + s.rows.filter(r => !r.es_credito_de_coordinadora).length, 0),
    Avales: (wb.sheets || []).reduce((a, s) => a + s.rows.filter(r => !!r.aval_nombre).length, 0),
    "Créditos": (wb.sheets || []).reduce((a, s) => a + s.rows.length, 0),
    Pagos: (wb.sheets || []).reduce((a, s) => a + s.rows.reduce((b, r) => b + (r.pagos?.length || 0), 0), 0),
  };
  const step: StepReport = { phase, total: (counts as any)[phase] || 0, done: 0, ok: 0, warn: 0, error: 0 };
  const setDone = (d: number) => { step.done = d; step.ok = d; };

  let errors: string[] = [];
  if (phase === "Poblaciones") errors = await commitPoblaciones(wb, (d) => setDone(d));
  if (phase === "Coordinadoras") errors = await commitCoordinadoras(wb, (d) => setDone(d));
  if (phase === "Clientes") errors = await commitClientes(wb, (d) => setDone(d));
  if (phase === "Avales") errors = await commitAvales(wb, (d) => setDone(d));
  if (phase === "Créditos") {
    const res = await commitCreditos(wb, (d) => setDone(d));
    errors = res.errors;
  }
  if (phase === "Pagos") {
    // para pagos por fase: primero intentar mapear créditos nuevamente
    const res = await commitCreditos(wb, (d) => {/* no avanza progreso aquí */});
    errors = await commitPagos(wb, res.creditoIdsByRow, (d) => setDone(d));
  }

  if (errors.length) step.error = errors.length;
  return { step, errors };
}
