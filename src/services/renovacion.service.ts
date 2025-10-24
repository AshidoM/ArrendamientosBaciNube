// src/services/renovacion.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPrimerPagoISO, esRenovablePorFecha } from "./creditos.service";
import { getCuotaSemanal } from "./montos.service";

export type RenovacionResumen = {
  creditoId: number;
  folioNuevoSugerido: number;
  renovable: boolean;
  sujeto: "CLIENTE" | "COORDINADORA";
  titular_id: number | null;
  semanas_plan: number;
  montoOriginal: number;
  cuotaOriginal: number;
  primer_pago: string | null;
  carteraVencida: number;
  multaM15Activa: number;
  montoNuevo: number;
  semanasNuevo: number;
  cuotaNueva: number;
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

async function getCarteraVencida(supabase: SupabaseClient, creditoId: number): Promise<number> {
  // Si tienes la vista vw_creditos_cuotas_m15 con campo "debe"
  const { data, error } = await supabase
    .from("vw_creditos_cuotas_m15")
    .select("debe, estado")
    .eq("credito_id", creditoId);
  if (error) throw error;
  return (data || [])
    .filter((r: any) => String(r.estado).toUpperCase() === "VENCIDA")
    .reduce((s: number, r: any) => s + Number(r.debe || 0), 0);
}

export async function prepararRenovacionResumen(supabase: SupabaseClient, creditoId: number): Promise<RenovacionResumen> {
  const base = await getCreditoBase(supabase, creditoId);
  const primerPago = await getPrimerPagoISO(creditoId);
  const m15 = await getM15ActivaMonto(supabase, creditoId);
  const cartera = await getCarteraVencida(supabase, creditoId);
  const renovable = primerPago ? esRenovablePorFecha(primerPago, new Date()) : false;

  const montoNuevo = Number(base.monto_principal ?? 0);
  const semanasNuevo = Number(base.semanas ?? 0);
  const cuotaNueva = getCuotaSemanal(montoNuevo, semanasNuevo);
  const netoADescontar = m15 + cartera;
  const netoAEntregar = Math.max(0, montoNuevo - netoADescontar);

  // sugerimos folio_externo siguiente
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
    carteraVencida: cartera,
    multaM15Activa: m15,
    montoNuevo,
    semanasNuevo,
    cuotaNueva,
    netoADescontar,
    netoAEntregar,
  };
}

export async function ejecutarRenovacion(supabase: SupabaseClient, anteriorId: number, payloadNuevo: any) {
  const { error } = await supabase.from("creditos").insert(payloadNuevo);
  if (error) throw error;
  await supabase.from("multas").update({ activa: false }).eq("credito_id", anteriorId).eq("tipo", "M15").eq("activa", true);
  await supabase.from("creditos").update({ estado: "FINALIZADO" }).eq("id", anteriorId);
}
