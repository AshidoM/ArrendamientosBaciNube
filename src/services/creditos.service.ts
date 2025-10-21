// src/services/creditos.service.ts
import { supabase } from "../lib/supabase";

// ---------- Tipos ----------
export type Sujeto = "CLIENTE" | "COORDINADORA";

export type CreditoRow = {
  id: number;
  folio_publico?: string | null;

  // Tabla base
  folio?: string | null;
  folio_externo?: number | null;

  sujeto: Sujeto;

  // semanas (vista/tabla)
  semanas?: number;
  semanas_plan?: number;

  monto_principal?: number;
  monto?: number;

  cuota_semanal?: number;
  cuota?: number;

  estado: string;

  // FECHAS
  fecha_disposicion?: string;     // tabla
  fecha_alta?: string;            // vista (la usamos como “alta/disposición”)
  primer_pago?: string | null;    // NUEVO: tabla (si agregaste la columna)

  // Embeds
  cliente?: { nombre?: string | null } | null;
  coordinadora?: { nombre?: string | null } | null;
};

// ---------- Helpers internos ----------
function coalesceNombre(r: CreditoRow): string {
  const n = r.sujeto === "CLIENTE" ? r.cliente?.nombre : r.coordinadora?.nombre;
  return (n ?? "").toString();
}

function coalesceSemanas(r: CreditoRow): number {
  return Number(r.semanas_plan ?? r.semanas ?? 0);
}
function coalesceMonto(r: CreditoRow): number {
  return Number(r.monto ?? r.monto_principal ?? 0);
}
function coalesceCuota(r: CreditoRow): number {
  return Number(r.cuota ?? r.cuota_semanal ?? 0);
}
function coalesceFechaAlta(r: CreditoRow): string | null {
  return (r.fecha_alta ?? r.fecha_disposicion ?? null) as string | null;
}

export function mostrarFolio(r: CreditoRow): string {
  if (r.folio_publico) return r.folio_publico;
  if (r.folio_externo != null) return String(r.folio_externo);
  if (r.folio) return r.folio;
  return `CR-${r.id}`;
}

// ---------- Paginado / listado ----------
export async function getCreditosPaged(offset: number, limit: number, search?: string) {
  // ¿Existe la vista?
  let useView = true;
  const probe = await supabase.from("vw_creditos_ui").select("id", { count: "exact", head: true });
  if (probe.error) useView = false;

  let q = useView
    ? supabase
        .from("vw_creditos_ui")
        .select(
          `
          id, folio_publico, folio, folio_externo, sujeto,
          semanas_plan, monto, cuota, estado, fecha_alta,
          cliente:clientes(nombre),
          coordinadora:coordinadoras(nombre)
        `,
          { count: "exact" }
        )
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1)
    : supabase
        .from("creditos")
        .select(
          `
          id, folio, folio_externo, sujeto,
          semanas, monto_principal, cuota_semanal, estado,
          fecha_disposicion, primer_pago,
          cliente:clientes(nombre),
          coordinadora:coordinadoras(nombre)
        `,
          { count: "exact" }
        )
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);

  if (search?.trim()) {
    const s = search.trim();
    const n = Number(s);
    if (!Number.isNaN(n)) q = q.eq("folio_externo", n);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  // Normalización de filas para que el UI tenga siempre los mismos campos
  let rows = (data || []) as CreditoRow[];
  rows = rows.map((r) => {
    // Si viene de la TABLA: “promover” a los nombres usados por el UI
    if (!r.semanas_plan && r.semanas != null) r.semanas_plan = r.semanas;
    if (!r.fecha_alta && r.fecha_disposicion) r.fecha_alta = r.fecha_disposicion;
    return r;
  });

  if (search?.trim() && Number.isNaN(Number(search))) {
    const sL = search.trim().toLowerCase();
    rows = rows.filter((r) => coalesceNombre(r).toLowerCase().includes(sL));
  }

  return { rows, total: count ?? rows.length };
}

// ---------- Avance real ----------
export async function getAvanceFor(
  creditoIds: number[]
): Promise<Record<number, { pagadas: number; total: number }>> {
  if (creditoIds.length === 0) return {};
  const { data, error } = await supabase
    .from("creditos_cuotas")
    .select("credito_id, num_semana, monto_programado, abonado, estado")
    .in("credito_id", creditoIds);
  if (error) throw error;

  const map: Record<number, { pagadas: number; total: number }> = {};
  for (const id of creditoIds) map[id] = { pagadas: 0, total: 0 };

  for (const r of (data || []) as any[]) {
    const key = Number(r.credito_id);
    const paid =
      Number(r.abonado) >= Number(r.monto_programado) || r.estado === "PAGADA";
    map[key] = {
      total: map[key].total + 1,
      pagadas: map[key].pagadas + (paid ? 1 : 0),
    };
  }
  return map;
}

export async function hasPagos(creditoId: number): Promise<boolean> {
  const { count, error } = await supabase
    .from("pagos")
    .select("id", { count: "exact", head: true })
    .eq("credito_id", creditoId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function getPrimerPagoISO(creditoId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("creditos_cuotas")
    .select("fecha_programada")
    .eq("credito_id", creditoId)
    .eq("num_semana", 1)
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.fecha_programada as string | undefined) ?? null;
}

// ---------- Renovación / semanas por fecha ----------
function _startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function numeroSemanaActual(primerPagoISO: string, hoy: Date = new Date()): number {
  const start = new Date(primerPagoISO);
  const a = _startOfDayLocal(hoy).getTime();
  const b = _startOfDayLocal(start).getTime();
  const diff = Math.floor((a - b) / (7 * 24 * 3600 * 1000));
  return Math.max(1, diff + 1);
}
export function semanasTranscurridas(primerPagoISO: string, hoy: Date = new Date()): number {
  const n = numeroSemanaActual(primerPagoISO, hoy) - 1;
  return Math.max(0, n);
}
export function esRenovablePorFecha(primerPagoISO: string, hoy: Date = new Date()): boolean {
  return numeroSemanaActual(primerPagoISO, hoy) >= 11;
}

// ---------- Folio ----------
export async function getNextFolioAuto(): Promise<number> {
  const { data, error } = await supabase
    .from("creditos")
    .select("folio_externo")
    .not("folio_externo", "is", null)
    .order("folio_externo", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = Number(data?.[0]?.folio_externo ?? 0);
  return (Number.isFinite(max) ? max : 0) + 1;
}
export async function folioDisponible(folio: number | string): Promise<boolean> {
  const n = Number(folio);
  if (!Number.isFinite(n)) return false;
  const { count, error } = await supabase
    .from("creditos")
    .select("id", { count: "exact", head: true })
    .eq("folio_externo", n);
  if (error) throw error;
  return (count ?? 0) === 0;
}

// ---------- Lectura puntual ----------
export async function getCreditoById(creditoId: number): Promise<{
  id: number;
  sujeto: Sujeto;
  cliente_id: number | null;
  coordinadora_id: number | null;
  poblacion_id: number;
  ruta_id: number;
  plan_id: number | null;
  semanas_plan: number;
  monto: number;
  cuota: number;
  estado: string;
  primer_pago: string;
}> {
  const tryView = await supabase
    .from("vw_creditos_ui")
    .select(
      `
      id, sujeto,
      cliente_id, coordinadora_id, poblacion_id, ruta_id, plan_id,
      semanas_plan, monto, cuota, estado,
      fecha_alta
    `
    )
    .eq("id", creditoId)
    .limit(1);

  if (!tryView.error && tryView.data && tryView.data.length === 1) {
    const r = tryView.data[0] as any;
    return {
      id: r.id,
      sujeto: r.sujeto,
      cliente_id: r.cliente_id ?? null,
      coordinadora_id: r.coordinadora_id ?? null,
      poblacion_id: r.poblacion_id,
      ruta_id: r.ruta_id,
      plan_id: r.plan_id ?? null,
      semanas_plan: Number(r.semanas_plan ?? 0),
      monto: Number(r.monto ?? 0),
      cuota: Number(r.cuota ?? 0),
      estado: r.estado,
      primer_pago: r.fecha_alta, // usamos fecha_alta como arranque en la vista
    };
  }

  const { data, error } = await supabase
    .from("creditos")
    .select(
      `
      id, sujeto, cliente_id, coordinadora_id, poblacion_id, ruta_id, plan_id,
      semanas, monto_principal, cuota_semanal, estado,
      fecha_disposicion, primer_pago
    `
    )
    .eq("id", creditoId)
    .limit(1);
  if (error) throw error;
  const r = (data?.[0] ?? null) as any;
  if (!r) throw new Error("Crédito no encontrado");

  return {
    id: r.id,
    sujeto: r.sujeto,
    cliente_id: r.cliente_id ?? null,
    coordinadora_id: r.coordinadora_id ?? null,
    poblacion_id: r.poblacion_id,
    ruta_id: r.ruta_id,
    plan_id: r.plan_id ?? null,
    semanas_plan: Number(r.semanas ?? 0),
    monto: Number(r.monto_principal ?? 0),
    cuota: Number(r.cuota_semanal ?? 0),
    estado: r.estado,
    primer_pago: r.primer_pago ?? r.fecha_disposicion,
  };
}
