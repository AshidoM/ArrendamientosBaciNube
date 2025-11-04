// src/services/import/rules.ts
import { supabase } from "../../lib/supabase";

export type Sujeto = "CLIENTE" | "COORDINADORA";

export type GenCuotasParams = {
  credito_id: number;
  sujeto: Sujeto;
  semanas?: number | null;
  fecha_disposicion?: string | null; // yyyy-mm-dd
  cuota?: number | null;
};

/**
 * Regla de semanas por sujeto si no viene especificado:
 *  - CLIENTE: 14 (o 13 si así lo pasas en params.semanas)
 *  - COORDINADORA: 10 (o 9 si así lo pasas en params.semanas)
 */
export function defaultWeeksBySujeto(sujeto: Sujeto, semanas?: number | null) {
  if (semanas && semanas > 0) return semanas;
  return sujeto === "COORDINADORA" ? 10 : 14;
}

/**
 * Calcula la fecha de primer pago. Si no hay una regla más compleja,
 * toma la misma fecha de disposición o el siguiente día hábil simple (aquí = +7 días para primer vencimiento).
 * Si ya traes tu propia lógica, cámbiala aquí.
 */
export function calcPrimerPago(fecha_disposicion?: string | null) {
  if (!fecha_disposicion) return null;
  const d = new Date(fecha_disposicion + "T00:00:00");
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Genera el calendario semanal simple (1 semana = +7 días) a partir de primer_pago.
 * Si no hay primer_pago, intenta con fecha_disposicion (+7).
 */
export function generarCalendarioSemanal(primer_pago: string | null, semanas: number, fecha_disposicion?: string | null) {
  const fechas: string[] = [];
  let base = primer_pago ?? calcPrimerPago(fecha_disposicion);
  if (!base) return fechas;
  const d0 = new Date(base + "T00:00:00");
  for (let i = 0; i < semanas; i++) {
    const di = new Date(d0);
    di.setDate(d0.getDate() + 7 * i);
    fechas.push(di.toISOString().slice(0, 10));
  }
  return fechas;
}

/**
 * Genera las cuotas estándar para creditos_cuotas.
 * Estados iniciales: PENDIENTE; m15=false; abonado=0; debe = cuota (si viene).
 */
export function generarCuotas(params: GenCuotasParams) {
  const semanas = defaultWeeksBySujeto(params.sujeto, params.semanas);
  const primer_pago = calcPrimerPago(params.fecha_disposicion);
  const calendario = generarCalendarioSemanal(primer_pago, semanas, params.fecha_disposicion);

  return calendario.map((fecha, i) => {
    const semana = i + 1;
    const cuota = params.cuota ?? null;
    return {
      credito_id: params.credito_id,
      num_semana: semana,
      fecha_programada: fecha,
      estado: "PENDIENTE",
      m15: false,
      abonado: 0,
      debe: cuota ?? null,
      monto_programado: cuota ?? null,
    };
  });
}

/**
 * Crea una M15 activa (pendiente) para un crédito si así se requiere.
 * Respetamos unicidad: una M15 activa por crédito (y por cuota) se asegura con tus índices/constraints.
 * Si la BD ya tiene triggers que crean M15 desde cambios en cuotas, este helper es opcional.
 */
export async function upsertM15Activa(credito_id: number, cuota_semana?: number | null) {
  const payload: any = { credito_id, tipo: "M15", activa: true, estado: "PENDIENTE" };
  if (cuota_semana && cuota_semana > 0) payload.cuota_semana = cuota_semana;
  const { error } = await supabase.from("multas").insert(payload);
  // Si hay unique violation, la ignoramos como éxito idempotente
  if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
}

/**
 * Inserta cuotas en creditos_cuotas (idempotente con unique por (credito_id,num_semana)).
 */
export async function insertarCuotas(rows: any[]) {
  if (!rows.length) return;
  const { error } = await supabase.from("creditos_cuotas").insert(rows);
  if (error) {
    // si el esquema ya tiene registros, puedes intentar upsert; por default intentamos insert puro
    // para no modificar abonos existentes
    // Si quieres permitir upsert aquí, reemplaza por upsert con onConflict: ["credito_id","num_semana"]
    if (!String(error.message || "").toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
  }
}
