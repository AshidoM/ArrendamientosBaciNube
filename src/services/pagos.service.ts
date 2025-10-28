import { supabase } from "../lib/supabase";
import { creditoPerteneceAlCapturista } from "../lib/authz";

/* ===========================
   Tipos expuestos al front
   =========================== */
export type TipoPago = "CUOTA" | "VENCIDA" | "ABONO";

export type CreditoPagable = {
  id: number;
  folio_publico: string | null;
  folio_externo: number | null;
  sujeto: "CLIENTE" | "COORDINADORA";
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

  // Para autorización
  poblacion_id?: number | null;
};

export type CuotaRow = {
  id: number;
  credito_id: number;
  num_semana: number;
  fecha_programada: string;
  monto_programado: number;
  abonado: number;
  debe: number;
  estado: "PENDIENTE" | "PARCIAL" | "PAGADA" | "VENCIDA";
  m15_activa: boolean;
  m15_count: number;
};

export type PagoRow = {
  id: number;
  credito_id: number;
  fecha: string;
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
   Helpers
   =========================== */
function normEstado(s: any): CuotaRow["estado"] {
  const t = String(s || "").toUpperCase();
  return (["PENDIENTE","PARCIAL","PAGADA","VENCIDA"] as const).includes(t as any)
    ? (t as CuotaRow["estado"])
    : "PENDIENTE";
}

export function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}
export function titularDe(c: CreditoPagable): string {
  return c.sujeto === "CLIENTE" ? (c.cliente_nombre ?? "—") : (c.coordinadora_nombre ?? "—");
}

// --- Autorización estricta por POBLACIÓN ---
// Si la vista no trae poblacion_id, la buscamos en creditos.
async function _fetchPoblacionId(creditoId: number): Promise<number | null> {
  const { data, error } = await supabase
    .from("creditos")
    .select("poblacion_id")
    .eq("id", creditoId)
    .maybeSingle();
  if (error) throw error;
  return (data?.poblacion_id ?? null) as number | null;
}

async function _autorizadoPopOnly(credito: { id: number; poblacion_id?: number | null }): Promise<boolean> {
  const pid = credito.poblacion_id ?? (await _fetchPoblacionId(credito.id));
  if (pid == null) return false;
  // Pasamos solo poblacion_id para evitar que una ruta habilite acceso
  return creditoPerteneceAlCapturista({ poblacion_id: pid });
}

async function _ensureAuthByCreditoId(creditoId: number): Promise<void> {
  const pid = await _fetchPoblacionId(creditoId);
  if (pid == null) throw new Error("No autorizado.");
  const ok = await creditoPerteneceAlCapturista({ poblacion_id: pid });
  if (!ok) throw new Error("No autorizado.");
}

/* ===========================
   Búsquedas
   =========================== */
export async function findCreditoPagable(term: string): Promise<CreditoPagable | null> {
  const s = term.trim();
  if (!s) return null;

  const n = Number(s);
  const base = supabase.from("vw_creditos_pagables").select("*").order("id",{ascending:false});

  if (!Number.isNaN(n)) {
    const { data, error } = await base.eq("folio_externo", n).limit(1);
    if (error) throw error;
    const c = (data?.[0] ?? null) as CreditoPagable | null;
    if (!c) return null;
    if (!(await _autorizadoPopOnly(c))) return null;
    return c;
  }

  if (s.toUpperCase().startsWith("CR-")) {
    const { data, error } = await base.eq("folio_publico", s).limit(1);
    if (error) throw error;
    const c = (data?.[0] ?? null) as CreditoPagable | null;
    if (!c) return null;
    if (!(await _autorizadoPopOnly(c))) return null;
    return c;
  }

  // por nombre (cliente/coordinadora), primer match autorizado
  const byCli = await base.ilike("cliente_nombre", `%${s}%`).limit(5);
  if (!byCli.error && byCli.data?.length) {
    for (const row of byCli.data as CreditoPagable[]) {
      if (await _autorizadoPopOnly(row)) return row;
    }
  }
  const byCoo = await base.ilike("coordinadora_nombre", `%${s}%`).limit(5);
  if (!byCoo.error && byCoo.data?.length) {
    for (const row of byCoo.data as CreditoPagable[]) {
      if (await _autorizadoPopOnly(row)) return row;
    }
  }
  return null;
}

/* ===========================
   Listas (con autorización)
   =========================== */
export async function getCuotas(creditoId: number): Promise<CuotaRow[]> {
  await _ensureAuthByCreditoId(creditoId);

  const { data, error } = await supabase
    .from("vw_creditos_cuotas_m15")
    .select("*")
    .eq("credito_id", creditoId)
    .order("num_semana", { ascending: true });
  if (error) throw error;

  return (data || []).map((r: any) => ({
    ...r,
    estado: normEstado(r.estado),
    m15_activa: !!r.m15_activa,
    m15_count: Number(r.m15_count || 0),
    debe: Number(r.debe || 0),
    abonado: Number(r.abonado || 0),
    monto_programado: Number(r.monto_programado || 0),
  })) as CuotaRow[];
}

export async function getPagos(creditoId: number): Promise<PagoRow[]> {
  await _ensureAuthByCreditoId(creditoId);

  const { data, error } = await supabase
    .from("vw_creditos_pagos")
    .select("*")
    .eq("credito_id", creditoId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return (data || []) as PagoRow[];
}

/* ===========================
   Acciones (todas con autorización previa)
   =========================== */

export async function simularAplicacion(creditoId: number, monto: number): Promise<SimulacionItem[]> {
  await _ensureAuthByCreditoId(creditoId);

  const { data, error } = await supabase.rpc("fn_simular_aplicacion_api", {
    p_credito_id: Number(creditoId),
    p_monto: Number(monto),
  });
  if (error) throw new Error(`No se pudo simular la aplicación: ${error.message}`);
  return (data || []) as SimulacionItem[];
}

export async function registrarPago(
  creditoId: number,
  monto: number,
  tipo: TipoPago,
  nota?: string
): Promise<RegistrarPagoResp> {
  await _ensureAuthByCreditoId(creditoId);

  const { data, error } = await supabase.rpc("fn_registrar_pago_api", {
    p_credito_id: Number(creditoId),
    p_monto: Number(monto),
    p_nota: nota ?? null,
    p_tipo_text: String(tipo).toUpperCase(),
    p_usuario_id: null,
  });
  if (error) throw new Error(`No se pudo registrar el pago: ${error.message}`);
  return data as RegistrarPagoResp;
}

/** Marcar siguiente semana NO vencida (con saldo) como VENCIDA */
export async function marcarCuotaVencida(
  creditoId: number
): Promise<{ ok: boolean; semana?: number; cuota_id?: number; multa_id?: number; msg?: string }> {
  await _ensureAuthByCreditoId(creditoId);

  const { data, error } = await supabase.rpc("fn_marcar_vencida_api", {
    p_credito_id: Number(creditoId),
  });
  if (error) throw new Error(`No se pudo marcar la cuota como vencida: ${error.message}`);
  return data as any;
}

/** Re-aplicar todos los pagos del crédito */
export async function recalcularCredito(creditoId: number): Promise<void> {
  await _ensureAuthByCreditoId(creditoId);

  const { error } = await supabase.rpc("fn_reaplicar_pagos_credito", { p_credito_id: Number(creditoId) });
  if (error) throw new Error(`No se pudo recalcular el crédito: ${error.message}`);
}

/** Editar nota */
export async function editarPagoNota(pagoId: number, nota: string | null): Promise<void> {
  // comprobamos el crédito del pago y su población
  const { data: pago, error: e1 } = await supabase
    .from("pagos")
    .select("id, credito_id")
    .eq("id", pagoId)
    .maybeSingle();
  if (e1) throw e1;
  if (!pago) throw new Error("Pago no encontrado.");

  await _ensureAuthByCreditoId(pago.credito_id);

  const { error } = await supabase.from("pagos").update({ nota }).eq("id", pagoId);
  if (error) throw new Error(`No se pudo actualizar la nota: ${error.message}`);
}

/** Eliminar pago */
export async function eliminarPago(pagoId: number): Promise<void> {
  const { data: pago, error: e1 } = await supabase
    .from("pagos")
    .select("id, credito_id")
    .eq("id", pagoId)
    .maybeSingle();
  if (e1) throw e1;
  if (!pago) throw new Error("Pago no encontrado.");

  await _ensureAuthByCreditoId(pago.credito_id);

  const { error } = await supabase.rpc("fn_eliminar_pago_api", { p_pago_id: Number(pagoId) });
  if (error) throw new Error(`No se pudo eliminar el pago: ${error.message}`);
}

// ---- Lectura puntual con autorización (oculta no asignados) ----
export async function getCreditoById(creditoId: number): Promise<CreditoPagable | null> {
  const { data, error } = await supabase
    .from("vw_creditos_pagables")
    .select("*")
    .eq("id", creditoId)
    .limit(1);
  if (error) throw error;
  const c = (data?.[0] ?? null) as CreditoPagable | null;
  if (!c) return null;

  if (!(await _autorizadoPopOnly(c))) return null;
  return c;
}
