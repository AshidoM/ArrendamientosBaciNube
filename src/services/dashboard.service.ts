import { supabase } from "../lib/supabase";

/* =========================
   Fechas y helpers
========================= */
function toISO(d: Date): string {
  // YYYY-MM-DD (local)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}

export function monthBounds(d = new Date()): { start: string; end: string; days: string[] } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const startDate = new Date(y, m, 1);
  const endDate = new Date(y, m + 1, 0);
  const start = toISO(startDate);
  const end = toISO(endDate);
  const days: string[] = [];
  for (let i = 1; i <= endDate.getDate(); i++) days.push(toISO(new Date(y, m, i)));
  return { start, end, days };
}

export function daysBetweenInclusive(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = startISO.split("-").map(Number);
  const [ey, em, ed] = endISO.split("-").map(Number);
  const d = new Date(sy, (sm || 1) - 1, sd || 1);
  const end = new Date(ey, (em || 1) - 1, ed || 1);
  while (d <= end) {
    out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function roundPeso(n: number | null | undefined): number {
  return Math.round(Number(n || 0));
}

/* =========================
   Safe counters
========================= */
async function safeCount(table: string, filter?: (q: any) => any): Promise<number> {
  try {
    let q: any = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/* =========================
   Adeudo total (global) y por crédito
========================= */
export async function getAdeudoTotal(): Promise<number> {
  // Preferencia: v_credito_balance
  try {
    const { data, error } = await supabase.from("v_credito_balance").select("adeudo_total");
    if (error) throw error;
    if (data?.length) return data.reduce((s: number, r: any) => s + roundPeso(r.adeudo_total), 0);
  } catch {}
  // Fallback: vw_cartera_detalle
  try {
    const { data, error } = await supabase.from("vw_cartera_detalle").select("adeudo_total");
    if (error) throw error;
    if (data?.length) return data.reduce((s: number, r: any) => s + roundPeso(r.adeudo_total), 0);
  } catch {}
  return 0;
}

export type AdeudoCreditoRow = {
  id: number;
  folio: string;
  sujeto: "CLIENTE" | "COORDINADORA";
  titular: string;
  adeudo: number;
};

export async function getAdeudoPorCredito(): Promise<AdeudoCreditoRow[]> {
  try {
    const { data, error } = await supabase
      .from("v_credito_balance")
      .select("credito_id, adeudo_total");
    if (error) throw error;

    const ids = (data || []).map((r: any) => r.credito_id);
    if (!ids.length) return [];

    const { data: cdata, error: e2 } = await supabase
      .from("creditos")
      .select("id, sujeto, folio_publico, cliente_id, coordinadora_id")
      .in("id", ids);
    if (e2) throw e2;

    const cliIds = cdata?.map((c: any) => c.cliente_id).filter(Boolean) || [];
    const corIds = cdata?.map((c: any) => c.coordinadora_id).filter(Boolean) || [];
    const [clis, cors] = await Promise.all([
      cliIds.length
        ? supabase.from("clientes").select("id, nombre").in("id", cliIds)
        : Promise.resolve({ data: [] as any[] }),
      corIds.length
        ? supabase.from("coordinadoras").select("id, nombre").in("id", corIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const cMap = new Map<number, string>((clis.data || []).map((x: any) => [x.id, x.nombre]));
    const kMap = new Map<number, string>((cors.data || []).map((x: any) => [x.id, x.nombre]));
    const aMap = new Map<number, number>(
      (data || []).map((x: any) => [x.credito_id, roundPeso(x.adeudo_total)])
    );

    return (cdata || []).map((c: any) => ({
      id: c.id,
      folio: String(c.folio_publico || `CR-${c.id}`),
      sujeto: c.sujeto,
      titular: c.sujeto === "CLIENTE" ? cMap.get(c.cliente_id) || "—" : kMap.get(c.coordinadora_id) || "—",
      adeudo: aMap.get(c.id) || 0,
    }));
  } catch {
    return [];
  }
}

/* =========================
   Créditos: estados y split por sujeto
========================= */
export async function getCreditosCounts(): Promise<{
  activos: number;
  finalizados: number;
  total: number;
  porEstado: { estado: string; count: number }[];
}> {
  try {
    const { data, error } = await supabase.from("creditos").select("estado");
    if (error) throw error;
    const map = new Map<string, number>();
    let activos = 0,
      finalizados = 0;
    for (const r of data || []) {
      const e = String(r.estado || "DESCONOCIDO");
      map.set(e, (map.get(e) || 0) + 1);
      if (e === "ACTIVO") activos++;
      if (e === "FINALIZADO") finalizados++;
    }
    const porEstado = Array.from(map.entries()).map(([estado, count]) => ({ estado, count }));
    return { activos, finalizados, total: data?.length || 0, porEstado };
  } catch {
    return { activos: 0, finalizados: 0, total: 0, porEstado: [] };
  }
}

export async function getCreditosSplitPorSujeto(): Promise<{
  cliente: number;
  coordinadora: number;
  total: number;
}> {
  try {
    const { data, error } = await supabase.from("creditos").select("sujeto");
    if (error) throw error;
    let cliente = 0,
      coordinadora = 0;
    for (const r of data || []) {
      if (String(r.sujeto) === "CLIENTE") cliente++;
      else if (String(r.sujeto) === "COORDINADORA") coordinadora++;
    }
    return { cliente, coordinadora, total: (data || []).length };
  } catch {
    return { cliente: 0, coordinadora: 0, total: 0 };
  }
}

/* =========================
   Renovables
========================= */
export type RenovableLite = {
  id: number;
  folio: string;
  sujeto: "CLIENTE" | "COORDINADORA";
  titular: string;
  semanas_plan: number;
  semanas_pagadas: number;
  cuota: number;
  primer_pago: string | null;
};

export async function getRenovablesList(): Promise<RenovableLite[]> {
  try {
    const { data, error } = await supabase
      .from("vw_creditos_pagables")
      .select(
        "id, folio_publico, sujeto, cliente_nombre, coordinadora_nombre, semanas_plan, semanas_pagadas, cuota, primer_pago, estado"
      )
      .eq("estado", "ACTIVO")
      .gte("semanas_pagadas", 10)
      .order("id", { ascending: false });

    if (error) throw error;

    return (data || []).map((c: any) => ({
      id: c.id,
      folio: String(c.folio_publico || `CR-${c.id}`),
      sujeto: c.sujeto,
      titular: c.sujeto === "CLIENTE" ? c.cliente_nombre || "—" : c.coordinadora_nombre || "—",
      semanas_plan: Number(c.semanas_plan || 0),
      semanas_pagadas: Number(c.semanas_pagadas || 0),
      cuota: Number(c.cuota || 0),
      primer_pago: c.primer_pago || null,
    }));
  } catch {
    return [];
  }
}
export async function getRenovablesCount(): Promise<number> {
  const list = await getRenovablesList();
  return list.length;
}

/* =========================
   Ingresos por día (pagos registrados)
   - Preferencia: vw_creditos_pagos (fecha, monto)
   - Fallback: pagos (fecha, total/monto)
========================= */
export type IngresoDiario = { fecha: string; ingreso: number };

/**
 * Devuelve SIEMPRE una fila por cada fecha del arreglo `daysISO`,
 * con 0 si ese día no tuvo ingresos. Normaliza timestamps a YYYY-MM-DD.
 */
export async function getIngresosPorDia(
  startISO: string,
  endISO: string,
  daysISO: string[]
): Promise<IngresoDiario[]> {
  // 1) vista vw_creditos_pagos
  try {
    const { data, error } = await supabase
      .from("vw_creditos_pagos")
      .select("fecha, monto, total, importe")
      .gte("fecha", startISO)
      .lte("fecha", endISO);
    if (error) throw error;

    const map = new Map<string, number>();
    for (const r of data || []) {
      const rawF = (r as any).fecha;
      const f = typeof rawF === "string" ? rawF.slice(0, 10) : toISO(new Date(rawF));
      // algunos esquemas usan 'monto', otros 'total' o 'importe'
      const val = (r as any).monto ?? (r as any).total ?? (r as any).importe ?? 0;
      const m = roundPeso(val);
      map.set(f, (map.get(f) || 0) + m);
    }
    return daysISO.map((d) => ({ fecha: d, ingreso: map.get(d) || 0 }));
  } catch {}

  // 2) fallback a tabla pagos
  try {
    const { data, error } = await supabase
      .from("pagos")
      .select("fecha, total, monto, importe")
      .gte("fecha", startISO)
      .lte("fecha", endISO);
    if (error) throw error;

    const map = new Map<string, number>();
    for (const r of data || []) {
      const rawF = (r as any).fecha;
      const f = typeof rawF === "string" ? rawF.slice(0, 10) : toISO(new Date(rawF));
      const val = (r as any).total ?? (r as any).monto ?? (r as any).importe ?? 0;
      const m = roundPeso(val);
      map.set(f, (map.get(f) || 0) + m);
    }
    return daysISO.map((d) => ({ fecha: d, ingreso: map.get(d) || 0 }));
  } catch {
    return daysISO.map((d) => ({ fecha: d, ingreso: 0 }));
  }
}

/* =========================
   Cuota del día exacto (pendiente)
========================= */
export type CuotaDiaPayload = { fecha: string; total: number };

export async function getCuotaPorFecha(fechaISO: string): Promise<CuotaDiaPayload> {
  try {
    const { data, error } = await supabase
      .from("vw_creditos_cuotas")
      .select("fecha_programada, monto_programado, abonado, estado")
      .eq("fecha_programada", fechaISO);
    if (error) throw error;
    const total = (data || []).reduce((s: number, r: any) => {
      const programado = roundPeso(r.monto_programado);
      const abonado = roundPeso(r.abonado);
      const pendiente = Math.max(0, programado - abonado);
      const est = String(r.estado || "");
      if (est !== "PAGADA") return s + pendiente;
      return s;
    }, 0);
    return { fecha: fechaISO, total };
  } catch {
    return { fecha: fechaISO, total: 0 };
  }
}

/* =========================
   Catálogos
========================= */
export async function getCatalogCounts(): Promise<{
  clientes: number;
  coordinadoras: number;
  avales: number;
  operadores: number;
  poblaciones: number;
  rutas: number;
  usuarios: number;
}> {
  const [clientes, coordinadoras, avales, operadores, poblaciones, rutas, usuarios] =
    await Promise.all([
      safeCount("clientes"),
      safeCount("coordinadoras"),
      safeCount("avales"),
      safeCount("operadores"),
      safeCount("poblaciones"),
      safeCount("rutas"),
      safeCount("users_local"),
    ]);
  return { clientes, coordinadoras, avales, operadores, poblaciones, rutas, usuarios };
}
