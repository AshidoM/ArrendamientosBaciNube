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
 * Reglas de tope:
 * - Tabla “larga” (10, 13, 14): tope $6,000
 * - Tabla “corta” (9): tope $4,000
 * Nota: Para CLIENTE solo existen 13 y 14 (tope $6,000).
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

  const larga = [10, 13, 14].includes(semanas);
  // CLIENTE solo tiene 13/14 (larga), COORDINADORA: 9 (corta) y 10/13/14 (larga)
  const max = larga ? 6000 : 4000;

  return (data || [])
    .map((r: any) => ({ id: Number(r.id), monto: Number(r.monto) }))
    .filter((r) => r.monto > 0 && r.monto <= max);
}

/**
 * Tabla de cuotas:
 * - “Larga”: aplica a semanas 10, 13 y 14 (CLIENTE y COORDINADORA).
 * - “Corta”: aplica a semanas 9 (COORDINADORA).
 *
 * La cuota se “snappea” al múltiplo de $500 del rango permitido.
 */
export function getCuotaSemanal(monto: number, semanas: number): number {
  const m = Number(monto) || 0;

  // LARGA: semanas 10, 13 y 14
  if ([10, 13, 14].includes(semanas)) {
    const map: Record<number, number> = {
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
    if (map[m] != null) return map[m];
    const snap = Math.max(1000, Math.min(6000, Math.round(m / 500) * 500));
    return map[snap] ?? 110;
  }

  // CORTA: semanas 9
  const mapCorto: Record<number, number> = {
    1000: 120,
    1500: 180,
    2000: 230,
    2500: 280,
    3000: 340,
    3500: 390,
    4000: 450,
  };
  if (mapCorto[m] != null) return mapCorto[m];
  const snap = Math.max(1000, Math.min(4000, Math.round(m / 500) * 500));
  return mapCorto[snap] ?? 120;
}
