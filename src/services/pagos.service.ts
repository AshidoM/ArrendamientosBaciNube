// src/services/pagos.service.ts
import { supabase } from "../lib/supabase";

export type TipoPago = "CUOTA" | "VENCIDA" | "ABONO";

export interface CreditoPagable {
  id: number;
  folio_publico: string | null;
  folio_externo: string | null;
  sujeto: string;
  monto_total: number;
  cuota: number;
  adeudo_total: number;
  cartera_vencida: number;
  estado: string;
  poblacion_id: number | null;
  ruta_id: number | null;
  // cualquier otro campo que traigan las vistas (semanas, monto_principal, etc.)
  [key: string]: any;
}

export interface CuotaRow {
  id: number;
  credito_id: number;
  num_semana: number;
  fecha_programada: string;
  monto_programado: number;
  abonado: number;
  debe: number;
  estado: "PENDIENTE" | "PAGADA" | "VENCIDA" | "PARCIAL";
  m15_count: number;
  m15_activa: boolean;
  [key: string]: any;
}

export interface PagoRow {
  id: number;
  credito_id: number;
  fecha: string;
  monto: number;
  tipo: string;
  nota: string | null;
  [key: string]: any;
}

export interface RegistrarPagoResult {
  restante_no_aplicado: number;
}

/**
 * Formatea dinero en MXN.
 */
export function money(
  v: number | string | null | undefined
): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Obtiene el nombre del titular del crédito desde los campos que existan en la vista.
 */
export function titularDe(c: CreditoPagable): string {
  return (
    (c as any).titular ??
    (c as any).cliente_nombre ??
    (c as any).coordinadora_nombre ??
    (c as any).nombre_titular ??
    (c as any).nombre ??
    "—"
  );
}

/**
 * Helper extra: obtiene el nombre del titular directo de las tablas creditos + clientes/coordinadoras.
 * Lo usamos para complementar el objeto de crédito cuando la vista no trae el campo.
 */
export async function getTitularNombre(
  creditoId: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from("creditos")
    .select(
      `
        id,
        sujeto,
        cliente:clientes ( nombre ),
        coordinadora:coordinadoras ( nombre )
      `
    )
    .eq("id", creditoId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const sujeto = (data as any).sujeto;

  if (sujeto === "CLIENTE") {
    return ((data as any).cliente?.nombre as string | undefined) ?? null;
  }
  if (sujeto === "COORDINADORA") {
    return ((data as any).coordinadora?.nombre as string | undefined) ?? null;
  }

  return null;
}

/**
 * Busca un crédito pagable por término.
 * Soporta:
 *  - "CR-123"  -> folio_publico = "CR-123" o id = 123
 *  - "123"     -> id = 123  o folio_externo = 123 o folio_publico = "123"
 *  - otro texto (folio_publico / folio_externo / titular ilike)
 */
export async function findCreditoPagable(
  term: string
): Promise<CreditoPagable | null> {
  const t = term.trim();
  if (!t) return null;

  let query = supabase.from("vw_creditos_ui").select("*");

  const m = /^CR-(\d+)$/i.exec(t);

  if (m) {
    const id = Number(m[1]);
    query = query
      .or(
        [
          `id.eq.${id}`,
          `folio_publico.eq.${t}`,
        ].join(",")
      )
      .limit(1);
  } else if (/^\d+$/.test(t)) {
    const num = Number(t);
    query = query
      .or(
        [
          `id.eq.${num}`,
          `folio_externo.eq.${num}`,
          `folio_publico.eq.${t}`,
        ].join(",")
      )
      .limit(1);
  } else {
    query = query
      .or(
        [
          `folio_publico.eq.${t}`,
          `folio_externo.eq.${t}`,
          `titular.ilike.%${t}%`,
        ].join(",")
      )
      .limit(5);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) return null;

  return data[0] as CreditoPagable;
}

/**
 * Obtiene un crédito por id desde la vista UI.
 */
export async function getCreditoById(
  id: number
): Promise<CreditoPagable | null> {
  const { data, error } = await supabase
    .from("vw_creditos_ui")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as CreditoPagable | null;
}

/**
 * Cuotas del crédito con info de M15 (vista vw_creditos_cuotas_m15).
 */
export async function getCuotas(
  creditoId: number
): Promise<CuotaRow[]> {
  const { data, error } = await supabase
    .from("vw_creditos_cuotas_m15")
    .select("*")
    .eq("credito_id", creditoId)
    .order("num_semana", {
      ascending: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CuotaRow[];
}

/**
 * Pagos realizados del crédito (vista vw_creditos_pagos).
 */
export async function getPagos(
  creditoId: number
): Promise<PagoRow[]> {
  const { data, error } = await supabase
    .from("vw_creditos_pagos")
    .select("*")
    .eq("credito_id", creditoId)
    .order("fecha", {
      ascending: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PagoRow[];
}

/**
 * Simulación de aplicación de un monto sobre las cuotas actuales.
 * Lo hago en TS para no depender de un RPC.
 *
 * IMPORTANTE: aquí también usamos saldo = max(monto_programado - abonado, 0)
 */
export async function simularAplicacion(
  creditoId: number,
  monto: number
): Promise<
  {
    num_semana: number;
    aplica: number;
    saldo_semana: number;
  }[]
> {
  const m = Number(monto);
  if (!Number.isFinite(m) || m <= 0) return [];

  const cuotas = await getCuotas(creditoId);

  let restante = m;
  const out: {
    num_semana: number;
    aplica: number;
    saldo_semana: number;
  }[] = [];

  for (const c of cuotas) {
    if (restante <= 0) break;

    const saldo = Math.max(
      Number(c.monto_programado ?? 0) - Number(c.abonado ?? 0),
      0
    );

    if (saldo <= 0) continue;

    const aplica = Math.min(restante, saldo);
    const saldo_semana = saldo - aplica;

    out.push({
      num_semana: c.num_semana,
      aplica,
      saldo_semana,
    });

    restante -= aplica;
  }

  return out;
}

/**
 * Registra un pago usando la función SQL fn_registrar_pago_api.
 */
export async function registrarPago(
  creditoId: number,
  monto: number,
  tipo: TipoPago,
  nota?: string,
  fechaISO?: string,
  semanasVencidas?: number
): Promise<RegistrarPagoResult> {
  const payload: Record<string, any> = {
    p_credito_id: creditoId,
    p_monto: monto,
    p_tipo: tipo,
    // siempre mandamos los 6 parámetros aunque vayan null
    p_nota: nota ?? null,
    p_semanas_vencidas:
      typeof semanasVencidas === "number" && semanasVencidas > 0
        ? semanasVencidas
        : null,
    p_fecha_pago: fechaISO ?? new Date().toISOString(),
  };

  const { data, error } = await supabase.rpc(
    "fn_registrar_pago_api",
    payload
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const restante = Number(row?.restante_no_aplicado ?? 0);

  return {
    restante_no_aplicado: Number.isFinite(restante) ? restante : 0,
  };
}

/**
 * “Recalcular” / re-aplicar pagos del crédito.
 * Si existe un RPC específico lo llama, si no, simplemente no truena.
 */
export async function recalcularCredito(
  creditoId: number
): Promise<void> {
  try {
    const { error } = await supabase.rpc(
      "fn_reaplicar_pagos_credito",
      {
        p_credito_id: creditoId,
      }
    );
    if (error) {
      console.warn(
        "recalcularCredito warning:",
        error.message
      );
    }
  } catch (e) {
    console.warn(
      "recalcularCredito error:",
      (e as any)?.message
    );
  }
}

/**
 * Actualiza solo la nota de un pago.
 */
export async function editarPagoNota(
  pagoId: number,
  nota: string | null
): Promise<void> {
  const { error } = await supabase
    .from("pagos")
    .update({
      nota,
    })
    .eq("id", pagoId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Elimina un pago; los triggers de pago_partidas
 * se encargan de revertir la aplicación.
 */
export async function eliminarPago(
  pagoId: number
): Promise<void> {
  const { error } = await supabase
    .from("pagos")
    .delete()
    .eq("id", pagoId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Marca una cuota como VENCIDA para el crédito.
 * Lógica en TS: toma la primera cuota con saldo > 0
 * y estado PENDIENTE / PARCIAL y la marca VENCIDA.
 * El trigger sobre creditos_cuotas se encarga de crear la M15.
 */
export async function marcarCuotaVencida(
  creditoId: number
): Promise<{
  ok: boolean;
  semana?: number;
  msg?: string;
}> {
  const { data, error } = await supabase
    .from("creditos_cuotas")
    .select(
      "id, num_semana, estado, monto_programado, abonado, debe"
    )
    .eq("credito_id", creditoId)
    .order("num_semana", {
      ascending: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as any[];

  const target = rows.find((c) => {
    const estado = (c.estado || "").toUpperCase();
    const saldo = Math.max(
      Number(c.monto_programado ?? 0) - Number(c.abonado ?? 0),
      0
    );
    if (saldo <= 0) return false;
    return (
      estado === "PENDIENTE" ||
      estado === "PARCIAL"
    );
  });

  if (!target) {
    return {
      ok: false,
      msg: "No hay semanas con saldo para marcar como vencida.",
    };
  }

  const { error: upError } = await supabase
    .from("creditos_cuotas")
    .update({
      estado: "VENCIDA",
    })
    .eq("id", target.id);

  if (upError) {
    throw new Error(upError.message);
  }

  return {
    ok: true,
    semana: target.num_semana,
  };
}
