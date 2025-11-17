// src/services/creditos.service.ts
import { supabase } from "../lib/supabase";
import { getMyAssignedPopulationIds, getMyAssignedRouteIds, getMyRole } from "../lib/authz";

// ---------- Tipos ----------
export type Sujeto = "CLIENTE" | "COORDINADORA";

export type CreditoRow = {
  id: number;
  folio_publico?: string | null;
  folio?: string | null;
  folio_externo?: number | null;
  sujeto: Sujeto;
  semanas?: number;
  semanas_plan?: number;
  monto_principal?: number;
  monto?: number;
  cuota_semanal?: number;
  cuota?: number;
  estado: string;
  fecha_disposicion?: string;
  fecha_alta?: string;
  primer_pago?: string | null;
  poblacion_id?: number | null;
  ruta_id?: number | null;
  cliente?: { nombre?: string | null } | null;
  coordinadora?: { nombre?: string | null } | null;
};

function coalesceNombre(r: CreditoRow): string {
  const n = r.sujeto === "CLIENTE" ? r.cliente?.nombre : r.coordinadora?.nombre;
  return (n ?? "").toString();
}

export function mostrarFolio(r: CreditoRow): string {
  if (r.folio_publico) return r.folio_publico;
  if (r.folio_externo != null) return String(r.folio_externo);
  if (r.folio) return r.folio;
  return `CR-${r.id}`;
}

// ---------- Paginado / listado ----------
export async function getCreditosPaged(offset: number, limit: number, search?: string) {
  const role = await getMyRole();
  const isAdmin = role === "ADMIN";

  let useView = true;
  let viewHasGeo = true;
  const probe = await supabase.from("vw_creditos_ui").select("id", { count: "exact", head: true });
  if (probe.error) useView = false;
  if (useView) {
    const probeGeo = await supabase.from("vw_creditos_ui").select("poblacion_id,ruta_id", { head: true, count: "exact" });
    if (probeGeo.error) {
      useView = false;
      viewHasGeo = false;
    }
  }

  let q = useView
    ? supabase
        .from("vw_creditos_ui")
        .select(
          `
          id,
          folio_publico,
          folio,
          folio_externo,
          sujeto,
          semanas_plan,
          monto,
          cuota,
          estado,
          fecha_alta,
          poblacion_id,
          ruta_id,
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
          id,
          folio,
          folio_externo,
          sujeto,
          semanas,
          monto_principal,
          cuota_semanal,
          estado,
          fecha_disposicion,
          primer_pago,
          poblacion_id,
          ruta_id,
          cliente:clientes(nombre),
          coordinadora:coordinadoras(nombre)
        `,
          { count: "exact" }
        )
        .order("id", { ascending: false })
        .range(offset, offset + limit - 1);

  q = q.eq("estado", "ACTIVO");

  if (!isAdmin) {
    const [popIds, routeIds] = await Promise.all([getMyAssignedPopulationIds(), getMyAssignedRouteIds()]);
    if ((popIds?.length ?? 0) === 0 && (routeIds?.length ?? 0) === 0) {
      return { rows: [], total: 0 };
    }
    const buildOrAssigned = (pops: number[], routes: number[]) => {
      if (pops.length && routes.length) return `poblacion_id.in.(${pops.join(",")}),ruta_id.in.(${routes.join(",")})`;
      return null;
    };
    if (useView && viewHasGeo) {
      const orExpr = buildOrAssigned(popIds, routeIds);
      if (orExpr) q = q.or(orExpr);
      else if (popIds.length) q = q.in("poblacion_id", popIds);
      else if (routeIds.length) q = q.in("ruta_id", routeIds);
    } else {
      if (popIds.length && routeIds.length) q = q.or(buildOrAssigned(popIds, routeIds)!);
      else if (popIds.length) q = q.in("poblacion_id", popIds);
      else if (routeIds.length) q = q.in("ruta_id", routeIds);
    }
  }

  if (search?.trim()) {
    const s = search.trim();
    const n = Number(s);
    if (!Number.isNaN(n)) q = q.eq("folio_externo", n);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  let rows = (data || []) as CreditoRow[];
  rows = rows.map((r) => {
    if (!r.semanas_plan && r.semanas != null) r.semanas_plan = r.semanas;
    if (!r.monto && r.monto_principal != null) r.monto = r.monto_principal;
    if (!r.cuota && r.cuota_semanal != null) r.cuota = r.cuota_semanal;
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
    const paid = Number(r.abonado) >= Number(r.monto_programado) || String(r.estado).toUpperCase() === "PAGADA";
    map[key] = { total: map[key].total + 1, pagadas: map[key].pagadas + (paid ? 1 : 0) };
  }
  return map;
}

// ---------- Folio (para CreditoWizard) ----------
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
