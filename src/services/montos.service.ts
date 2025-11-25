// src/services/montos.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type SujetoCredito = "CLIENTE" | "COORDINADORA";

/**
 * Semanas permitidas por sujeto.
 * - CLIENTE: 13, 14
 * - COORDINADORA: 9, 10, 13, 14
 */
export function semanasPermitidasPorSujeto(sujeto: SujetoCredito): number[] {
  if (sujeto === "COORDINADORA") return [9, 10, 13, 14];
  return [13, 14];
}

/**
 * Devuelve montos permitidos del catálogo activo, respetando el tope por semanas/sujeto.
 *
 * Reglas de tope (actualizadas):
 * - Semanas 9  y 13  → tope $4,000  (tabla "corta")
 * - Semanas 10 y 14 → tope $6,000  (tabla "larga")
 *
 * Nota: Para CLIENTE existen 13 y 14 (13 con tope $4,000; 14 con tope $6,000).
 */
export async function getMontosValidos(
  supabase: SupabaseClient,
  sujeto: SujetoCredito,
  semanas: number
): Promise<{ id: number; monto: number }[]> {
  const { data, error } = await supabase
    .from("montos_permitidos")
    .select("id, monto, activo")
    .eq("activo", true)
    .order("monto", { ascending: true });
  if (error) throw error;

  // Tope por semanas (13 ahora es "corta" con tope 4000)
  const corta = [9, 13].includes(semanas);
  const max = corta ? 4000 : 6000;

  return (data || [])
    .map((r: any) => ({ id: Number(r.id), monto: Number(r.monto) }))
    .filter((r) => r.monto > 0 && r.monto <= max);
}

/**
 * Tabla de cuotas semanales:
 *
 * - "Larga" → semanas 10 y 14  (mapa hasta $6,000)
 * - "Corta" → semanas 9 y 13   (mapa hasta $4,000)
 *
 * Para 13 semanas, la cuota es idéntica a la de 9 semanas:
 *   1000→120, 1500→180, 2000→230, 2500→280, 3000→340, 3500→390, 4000→450.
 *
 * La cuota se "snappea" al múltiplo de $500 dentro del rango permitido.
 */
export function getCuotaSemanal(monto: number, semanas: number): number {
  const m = Number(monto) || 0;

  // ---- Mapas base
  const mapLargo: Record<number, number> = {
    1000: 110,
    1500: 160,
    2000: 210,
    2500: 260,
    3000: 310,
    3500: 360,
    4000: 410,
    4500: 460,
    5000: 510,
    5500: 560,
    6000: 610,
  };

  // "Corta" (aplica a 9 y 13 semanas)
  const mapCorto: Record<number, number> = {
    1000: 120,
    1500: 180,
    2000: 230,
    2500: 280,
    3000: 340,
    3500: 390,
    4000: 450,
  };

  // ---- Selección por semanas
  if (semanas === 9 || semanas === 13) {
    // Tope 4000; snap al múltiplo de 500 entre 1000–4000
    if (mapCorto[m] != null) return mapCorto[m];
    const snap = Math.max(1000, Math.min(4000, Math.round(m / 500) * 500));
    return mapCorto[snap] ?? 120;
  }

  // Semanas 10 o 14 → tabla larga (tope 6000)
  if (mapLargo[m] != null) return mapLargo[m];
  const snap = Math.max(1000, Math.min(6000, Math.round(m / 500) * 500));
  return mapLargo[snap] ?? 110;
}
