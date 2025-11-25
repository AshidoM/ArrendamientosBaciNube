// src/services/renovacion.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCuotaSemanal } from "./montos.service";

/** Resumen para el modal de renovación */
export type RenovacionResumen = {
  creditoId: number;
  folioNuevoSugerido: number;

  // regla de elegibilidad (avance >= 10 pagadas)
  renovable: boolean;

  sujeto: "CLIENTE" | "COORDINADORA";
  titular_id: number | null;

  semanas_plan: number;

  // datos del crédito base
  montoOriginal: number;
  cuotaOriginal: number;

  // informativo (no define renovación)
  primer_pago: string | null;

  // desglose de descuentos
  pendienteNoVencido: number; // cuotas PENDIENTE/PARCIAL (no vencidas)
  carteraVencida: number;     // solo VENCIDAS
  multaM15Activa: number;     // M15 activa
  papeleria: number;          // costo papelería (opcional)
  descuentoExtra: number;     // otros descuentos (opcional)
  totalDescuentos: number;    // suma de todo lo anterior

  // propuesta nuevo crédito (usando mismo monto/semanas por default)
  montoNuevo: number;
  semanasNuevo: number;
  cuotaNueva: number;

  // resultado final
  netoADescontar: number;
  netoAEntregar: number;
};

async function getCreditoBase(supabase: SupabaseClient, id: number) {
  const { data, error } = await supabase
    .from("creditos")
    .select("id, sujeto, cliente_id, coordinadora_id, semanas, monto_principal, cuota_semanal")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as any;
}

async function getM15ActivaMonto(supabase: SupabaseClient, creditoId: number): Promise<number> {
  const { data } = await supabase
    .from("multas")
    .select("monto")
    .eq("credito_id", creditoId)
    .eq("tipo", "M15")
    .eq("activa", true)
    .limit(1);
  return Number(data?.[0]?.monto ?? 0);
}

/** Cartera vencida = suma de debe en cuotas VENCIDAS */
async function getCarteraVencida(supabase: SupabaseClient, creditoId: number): Promise<number> {
  const { data, error } = await supabase
    .from("vw_creditos_cuotas_m15")
    .select("debe, estado")
    .eq("credito_id", creditoId);
  if (error) throw error;
  return (data || [])
    .filter((r: any) => String(r.estado).toUpperCase() === "VENCIDA")
    .reduce((s: number, r: any) => s + Number(r.debe || 0), 0);
}

/** Pendiente no vencido = suma de debe en PENDIENTE/PARCIAL (excluye VENCIDAS para no duplicar) */
async function getPendienteNoVencido(supabase: SupabaseClient, creditoId: number): Promise<number> {
  const { data, error } = await supabase
    .from("vw_creditos_cuotas_m15")
    .select("debe, estado")
    .eq("credito_id", creditoId);
  if (error) throw error;
  return (data || [])
    .filter((r: any) => {
      const e = String(r.estado).toUpperCase();
      return e === "PENDIENTE" || e === "PARCIAL";
    })
    .reduce((s: number, r: any) => s + Number(r.debe || 0), 0);
}

/** Semanas pagadas = avance por conteo de cuotas PAGADAS */
async function getSemanasPagadas(supabase: SupabaseClient, creditoId: number): Promise<number> {
  const { data, error } = await supabase
    .from("vw_creditos_cuotas_m15")
    .select("estado")
    .eq("credito_id", creditoId);
  if (error) throw error;
  return (data || []).filter((r: any) => String(r.estado).toUpperCase() === "PAGADA").length;
}

/** Primer pago informativo (si lo necesitas mostrar) */
async function getPrimerPagoISO(supabase: SupabaseClient, creditoId: number): Promise<string | null> {
  const { data } = await supabase
    .from("vw_creditos_cuotas_m15")
    .select("fecha_programada, num_semana")
    .eq("credito_id", creditoId)
    .eq("num_semana", 1)
    .limit(1);
  return (data?.[0]?.fecha_programada ?? null) as string | null;
}

/**
 * Prepara el resumen de renovación.
 * - Renovable por avance: semanas pagadas >= 10.
 * - Propuesta inicial: mismo monto y semanas del crédito base; la UI puede cambiar semanas (coordinadora: 9, 10, 13, 14).
 */
export async function prepararRenovacionResumen(
  supabase: SupabaseClient,
  creditoId: number,
  opts?: { papeleria?: number; descuentoExtra?: number }
): Promise<RenovacionResumen> {
  const base = await getCreditoBase(supabase, creditoId);
  const primerPago = await getPrimerPagoISO(supabase, creditoId);         // informativo
  const m15 = await getM15ActivaMonto(supabase, creditoId);
  const cartera = await getCarteraVencida(supabase, creditoId);
  const pendiente = await getPendienteNoVencido(supabase, creditoId);
  const semanasPagadas = await getSemanasPagadas(supabase, creditoId);

  const papeleria = Number(opts?.papeleria ?? 0);
  const descuentoExtra = Number(opts?.descuentoExtra ?? 0);

  // Regla: Renovable por avance (>= 10 semanas pagadas)
  const renovable = semanasPagadas >= 10;

  // Propuesta de nuevo crédito (igual al actual por defecto)
  const montoNuevo = Number(base.monto_principal ?? 0);
  const semanasNuevo = Number(base.semanas ?? 0);
  const cuotaNueva = getCuotaSemanal(montoNuevo, semanasNuevo);

  // Desglose y totales
  const totalDescuentos = m15 + cartera + pendiente + papeleria + descuentoExtra;
  const netoADescontar = totalDescuentos;
  const netoAEntregar = Math.max(0, montoNuevo - netoADescontar);

  // sugerir folio_externo siguiente
  let folioNuevoSugerido = 1;
  const { data } = await supabase
    .from("creditos")
    .select("folio_externo")
    .order("folio_externo", { ascending: false })
    .limit(1);
  folioNuevoSugerido = Number(data?.[0]?.folio_externo ?? 0) + 1;

  return {
    creditoId,
    folioNuevoSugerido,
    renovable,
    sujeto: base.sujeto,
    titular_id: (base.cliente_id ?? base.coordinadora_id) ?? null,
    semanas_plan: base.semanas,
    montoOriginal: Number(base.monto_principal ?? 0),
    cuotaOriginal: Number(base.cuota_semanal ?? 0),
    primer_pago: primerPago,

    // desglose
    pendienteNoVencido: pendiente,
    carteraVencida: cartera,
    multaM15Activa: m15,
    papeleria,
    descuentoExtra,
    totalDescuentos,

    // propuesta
    montoNuevo,
    semanasNuevo,
    cuotaNueva,

    // resultado
    netoADescontar,
    netoAEntregar,
  };
}

export async function ejecutarRenovacion(
  supabase: SupabaseClient,
  anteriorId: number,
  payloadNuevo: any
) {
  const { error } = await supabase.from("creditos").insert(payloadNuevo);
  if (error) throw error;

  // Desactivar M15 activa del crédito anterior y finalizarlo
  await supabase
    .from("multas")
    .update({ activa: false })
    .eq("credito_id", anteriorId)
    .eq("tipo", "M15")
    .eq("activa", true);

  await supabase
    .from("creditos")
    .update({ estado: "FINALIZADO" })
    .eq("id", anteriorId);
}
