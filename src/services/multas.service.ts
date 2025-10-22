// src/services/multas.service.ts
import { supabase } from "../lib/supabase";

export type Multa = {
  id: number;
  credito_id: number;
  cuota_id: number | null;
  tipo: "M15";
  estado: "ACTIVO" | "INACTIVO";
  activa: boolean;
  monto: number;
  monto_pagado: number;
  fecha_creacion: string;
  fecha_pago: string | null;
  semana: number | null;
  fecha_programada: string | null;
};

export async function listMultasByCredito(creditoId: number): Promise<Multa[]> {
  const { data, error } = await supabase
    .from("vw_multas")
    .select("*")
    .eq("credito_id", creditoId)
    .order("fecha_creacion", { ascending: false });
  if (error) throw error;
  return (data || []) as Multa[];
}

export async function desactivarMulta(multaId: number): Promise<void> {
  const { error } = await supabase
    .from("multas")
    .update({ activa: false, estado: "INACTIVO" })
    .eq("id", multaId);
  if (error) throw error;
}

export async function activarMulta(multaId: number): Promise<void> {
  const { error } = await supabase
    .from("multas")
    .update({ activa: true, estado: "ACTIVO" })
    .eq("id", multaId);
  if (error) throw error;
}

export async function eliminarMulta(multaId: number): Promise<void> {
  const { error } = await supabase.from("multas").delete().eq("id", multaId);
  if (error) throw error;
}
