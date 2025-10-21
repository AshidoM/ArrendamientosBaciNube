// src/services/pagos.service.ts
import { supabase } from "../lib/supabase";

/* ===========================
   Tipos expuestos al front
   =========================== */

export type TipoPago = "CUOTA" | "VENCIDA" | "ABONO";

export type CreditoPagable = {
  id: number;
  folio_publico: string | null;
  folio_externo: number | null;
  sujeto: "CLIENTE" | "COORDINADORA";
  semanas: number;                 // la vista trae semanas_plan; abajo normalizamos
  semanas_plan: number;
  monto_total: number;
  cuota: number;
  estado: string;
  fecha_disposicion: string | null;
  primer_pago: string | null;
  cliente_nombre: string | null;
  coordinadora_nombre: string | null;

  total_programado: number;
  total_abonado: number;
  adeudo_total: number;
  cartera_vencida: number;
  semanas_pagadas: number;
};

export type CuotaRow = {
  id: number;
  credito_id: number;
  num_semana: number;
  fecha_programada: string;
  monto_programado: number;
  abonado: number;
  /** Texto proveniente de la vista: PENDIENTE | PARCIAL | PAGADA | VENCIDA */
  estado: "PENDIENTE" | "PARCIAL" | "PAGADA" | "VENCIDA";
  /** Flag M15 visible en la tabla de cuotas */
  m15: boolean;
};

export type PagoRow = {
  id: number;
  credito_id: number;
  fecha: string;          // timestamptz
  monto: number;
  tipo: TipoPago;
  usuario_id: number | null;
  nota: string | null;
};

export type SimulacionItem = {
  num_semana: number;
  programado: number;
  abonado_antes: number;
  aplica: number;
  abonado_despues: number;
  saldo_semana: number;
  monto_restante: number;
};

export type RegistrarPagoResp = {
  pago_id: number;
  aplicacion: { num_semana: number; aplica: number }[];
  restante_no_aplicado: number;
  resumen: {
    semanas_pagadas: number;
    semanas_plan: number;
    adeudo_total: number;
    cartera_vencida: number;
  };
};

/* ===========================
   Normalizadores seguros
   =========================== */

function normEstadoCuota(s: any): CuotaRow["estado"] {
  const t = String(s || "").toUpperCase();
  if (t === "PAGADA" || t === "PARCIAL" || t === "VENCIDA") return t;
  return "PENDIENTE";
}

/* ===========================
   Búsquedas
   =========================== */

export async function findCreditoPagable(term: string): Promise<CreditoPagable | null> {
  const s = term.trim();
  if (!s) return null;

  const n = Number(s);
  const base = supabase
    .from("vw_creditos_pagables")
    .select("*")
    .order("id", { ascending: false });

  let q = base;

  if (!Number.isNaN(n)) {
    // folio_externo (numérico)
    q = q.eq("folio_externo", n);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    return (data?.[0] ?? null) as CreditoPagable | null;
  }

  if (s.toUpperCase().startsWith("CR-")) {
    // folio_publico (CR-#)
    q = q.eq("folio_publico", s);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    return (data?.[0] ?? null) as CreditoPagable | null;
  }

  // Por nombre (cliente o coordinadora)
  const byClient = await base.ilike("cliente_nombre", `%${s}%`).limit(1);
  if (!byClient.error && byClient.data && byClient.data.length) {
    const row = byClient.data[0] as any;
    row.semanas = row.semanas_plan;
    return row as CreditoPagable;
  }
  const byCoord = await base.ilike("coordinadora_nombre", `%${s}%`).limit(1);
  if (!byCoord.error && byCoord.data && byCoord.data.length) {
    const row = byCoord.data[0] as any;
    row.semanas = row.semanas_plan;
    return row as CreditoPagable;
  }

  return null;
}

export async function getCuotas(creditoId: number): Promise<CuotaRow[]> {
  const { data, error } = await supabase
    .from("vw_creditos_cuotas")
    .select("*")
    .eq("credito_id", creditoId)
    .order("num_semana", { ascending: true });
  if (error) throw error;

  // normaliza estado → union TS
  const rows = (data || []).map((r: any) => ({
    ...r,
    estado: normEstadoCuota(r.estado),
    m15: !!r.m15,
  })) as CuotaRow[];

  return rows;
}

export async function getPagos(creditoId: number): Promise<PagoRow[]> {
  const { data, error } = await supabase
    .from("vw_creditos_pagos")
    .select("*")
    .eq("credito_id", creditoId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return (data || []) as PagoRow[];
}

/* ===========================
   Acciones de negocio (RPC vía wrappers *_api)
   =========================== */

export async function simularAplicacion(creditoId: number, monto: number): Promise<SimulacionItem[]> {
  const { data, error } = await supabase.rpc("fn_simular_aplicacion_api", {
    p_credito_id: Number(creditoId),
    p_monto: Number(monto),
  });
  if (error) {
    throw new Error(`No se pudo simular la aplicación: ${error.message}`);
  }
  return (data || []) as SimulacionItem[];
}

export async function registrarPago(
  creditoId: number,
  monto: number,
  tipo: TipoPago,
  nota?: string
): Promise<RegistrarPagoResp> {
  // Usamos el wrapper *_api con p_tipo_text para evitar ambigüedad de overload
  const { data, error } = await supabase.rpc("fn_registrar_pago_api", {
    p_credito_id: Number(creditoId),
    p_monto: Number(monto),
    p_nota: nota ?? null,
    p_tipo_text: String(tipo).toUpperCase(), // CUOTA | VENCIDA | ABONO
    p_usuario_id: null,
  });
  if (error) {
    throw new Error(`No se pudo registrar el pago: ${error.message}`);
  }
  return data as RegistrarPagoResp;
}

export async function marcarNoPagoM15(
  creditoId: number
): Promise<{ ok: boolean; semana?: number; msg?: string }> {
  // Wrapper *_api para evitar ambigüedad si existen overloads
  const { data, error } = await supabase.rpc("fn_no_pago_m15_api", {
    p_credito_id: Number(creditoId),
  });
  if (error) {
    throw new Error(`No se pudo aplicar NO PAGO (M15): ${error.message}`);
  }
  return data as any;
}

/** Re-generar cuotas faltantes (rescate) */
export async function regenerarCuotas(creditoId: number): Promise<void> {
  const { error } = await supabase.rpc("fn_asignar_cuotas", {
    p_credito_id: Number(creditoId),
  });
  if (error) throw new Error(`No se pudieron generar cuotas: ${error.message}`);
}

/** Re-aplicar pagos del crédito (reconstruye aplicaciones y estados) */
export async function reaplicarPagosCredito(creditoId: number): Promise<void> {
  const { error } = await supabase.rpc("fn_reaplicar_pagos_credito", {
    p_credito_id: Number(creditoId),
  });
  if (error) throw new Error(`No se pudieron re-aplicar pagos: ${error.message}`);
}

/** Editar solo la nota del pago (monto/tipo NO se editan por integridad) */
export async function editarPagoNota(pagoId: number, nota: string | null): Promise<void> {
  const { error } = await supabase.from("pagos").update({ nota }).eq("id", pagoId);
  if (error) throw new Error(`No se pudo actualizar la nota: ${error.message}`);
}

/** Eliminar un pago completo y revertir aplicaciones (requiere RPC) */
export async function eliminarPago(pagoId: number): Promise<void> {
  const { error } = await supabase.rpc("fn_eliminar_pago", { p_pago_id: Number(pagoId) });
  if (error) throw new Error(`No se pudo eliminar el pago: ${error.message}`);
}

/* ===========================
   Helpers UI
   =========================== */

export function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

export function titularDe(c: CreditoPagable): string {
  return c.sujeto === "CLIENTE"
    ? (c.cliente_nombre ?? "—")
    : (c.coordinadora_nombre ?? "—");
}
