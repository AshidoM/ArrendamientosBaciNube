import type { SupabaseClient } from "@supabase/supabase-js";
export type SujetoCredito = "CLIENTE" | "COORDINADORA";

export async function getMontosValidos(
  supabase: SupabaseClient,
  _sujeto: SujetoCredito,
  semanas: number
): Promise<{ id: number; monto: number }[]> {
  const { data, error } = await supabase
    .from("montos_permitidos")
    .select("id, monto, activo")
    .eq("activo", true)
    .order("monto", { ascending: true });

  if (error) throw error;

  const max = [14, 10].includes(semanas) ? 6000 : 4000;
  return (data || [])
    .map((r: any) => ({ id: Number(r.id), monto: Number(r.monto) }))
    .filter((r) => r.monto > 0 && r.monto <= max);
}

/** Tabla de cuotas personalizadas. */
export function getCuotaSemanal(monto: number, semanas: number): number {
  const m = Number(monto) || 0;
  if ([14, 10].includes(semanas)) {
    const map: Record<number, number> = {
      1000: 110, 1500: 160, 2000: 210, 2500: 260, 3000: 310,
      3500: 360, 4000: 410, 4500: 460, 5000: 510, 5500: 560, 6000: 610,
    };
    if (map[m] != null) return map[m];
    const snap = Math.max(1000, Math.min(6000, Math.round(m / 500) * 500));
    return map[snap] ?? 110;
  }
  const mapCorto: Record<number, number> = {
    1000: 120, 1500: 180, 2000: 230, 2500: 280, 3000: 340, 3500: 390, 4000: 450,
  };
  if (mapCorto[m] != null) return mapCorto[m];
  const snap = Math.max(1000, Math.min(4000, Math.round(m / 500) * 500));
  return mapCorto[snap] ?? 120;
}
