// src/services/geo.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type Opcion = { id: number; nombre: string };

export async function getPoblaciones(supabase: SupabaseClient): Promise<Opcion[]> {
  const { data, error } = await supabase
    .from("poblaciones")
    .select("id, nombre")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) }));
}

export async function getRutasPorPoblacion(supabase: SupabaseClient, poblacionId: number): Promise<Opcion[]> {
  const { data, error } = await supabase
    .from("rutas")
    .select("id, nombre")
    .eq("poblacion_id", poblacionId)
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) }));
}
