// src/services/accesos.service.ts
import { supabase } from "../lib/supabase";

export async function searchPoblaciones(q: string) {
  let req = supabase.from("poblaciones").select("id,nombre,municipio,estado_mx,ruta_id").order("id", { ascending: true }).limit(50);
  const s = q.trim();
  if (s.length >= 2) req = req.ilike("nombre", `%${s}%`);
  const { data, error } = await req;
  if (error) throw error;
  return data || [];
}

export async function listCapturistas(q: string) {
  let req = supabase.from("users_local").select("id,username,nombre,rol").eq("rol", "CAPTURISTA").order("nombre", { ascending: true }).limit(50);
  const s = q.trim();
  if (s.length >= 2) req = req.or(`nombre.ilike.%${s}%,username.ilike.%${s}%`);
  const { data, error } = await req;
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: r.id, username: r.username, nombre: r.nombre }));
}

export async function listAsignados(poblacionId: number) {
  const { data, error } = await supabase.from("capturista_poblaciones").select("capturista_id,activo").eq("poblacion_id", poblacionId).order("capturista_id", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addAsignacion(poblacionId: number, capturistaId: string) {
  const { error } = await supabase.from("capturista_poblaciones").upsert({ poblacion_id: poblacionId, capturista_id: capturistaId, activo: true }, { onConflict: "poblacion_id,capturista_id" });
  if (error) throw error;
}

export async function removeAsignacion(poblacionId: number, capturistaId: string) {
  const { error } = await supabase.from("capturista_poblaciones").delete().eq("poblacion_id", poblacionId).eq("capturista_id", capturistaId);
  if (error) throw error;
}
