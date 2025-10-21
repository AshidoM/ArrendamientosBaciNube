import type { SupabaseClient } from "@supabase/supabase-js";
import type { SujetoCredito } from "./montos.service";

export async function getPlanIdPor(
  supabase: SupabaseClient,
  sujeto: SujetoCredito,
  semanas: number
): Promise<number | null> {
  const { data, error } = await supabase
    .from("planes")
    .select("id")
    .eq("sujeto", sujeto)
    .eq("semanas", semanas)
    .eq("activo", true)
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
}
