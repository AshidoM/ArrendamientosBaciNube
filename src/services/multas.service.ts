// src/services/multas.service.ts
import { supabase } from "../lib/supabase";

export type Multa = {
  id: number;
  credito_id: number;
  tipo: "M15";
  activa: boolean;
  motivo?: string | null;
  created_at?: string;
};

export async function getM15Activa(creditoId: number): Promise<Multa | null> {
  const { data, error } = await supabase
    .from("multas")
    .select("id, credito_id, tipo, activa, motivo, created_at")
    .eq("credito_id", creditoId)
    .eq("tipo", "M15")
    .eq("activa", true)
    .maybeSingle();
  if (error) throw error;
  return data as Multa | null;
}

export async function createM15IfNotExists(creditoId: number, motivo?: string) {
  const existing = await getM15Activa(creditoId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("multas")
    .insert({
      credito_id: creditoId,
      tipo: "M15",
      activa: true,
      motivo: motivo ?? "No pagó (auto)",
    })
    .select()
    .single();

  // si existe índice único parcial y hay choque, ignorar
  if (error && (error as any).code !== "23505") throw error;
  return data as Multa;
}

export async function desactivarM15(creditoId: number) {
  const { error } = await supabase
    .from("multas")
    .update({ activa: false })
    .eq("credito_id", creditoId)
    .eq("tipo", "M15")
    .eq("activa", true);
  if (error) throw error;
}

export async function toggleM15(creditoId: number) {
  const current = await getM15Activa(creditoId);
  if (current) {
    await desactivarM15(creditoId);
    return { status: "DESACTIVADA" as const };
  } else {
    await createM15IfNotExists(creditoId, "Activada manualmente");
    return { status: "ACTIVADA" as const };
  }
}

// Llamar al renovar crédito
export async function onRenovarCredito(creditoId: number) {
  await desactivarM15(creditoId);
}
