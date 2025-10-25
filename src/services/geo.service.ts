// src/services/geo.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getUser } from "../auth";

export type Opcion = { id: number; nombre: string };

/** Poblaciones visibles para el usuario autenticado (ADMIN = todas; CAPTURISTA = asignadas) */
export async function getPoblaciones(supa: SupabaseClient): Promise<Opcion[]> {
  const me = getUser();
  let query = supa.from("poblaciones").select("id, nombre").order("nombre", { ascending: true });

  if (me?.rol === "CAPTURISTA") {
    // limitar a asignadas
    const { data: asignadas, error: e1 } = await supa
      .from("capturista_poblaciones")
      .select("poblacion_id")
      .eq("capturista_id", me.id)
      .eq("activo", true);
    if (e1) throw e1;

    const ids = (asignadas ?? []).map((r: any) => r.poblacion_id);
    if (ids.length === 0) return []; // no tiene nada asignado

    query = supa.from("poblaciones").select("id, nombre").in("id", ids).order("nombre", { ascending: true });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) }));
}

/** Rutas visibles: si CAPTURISTA, solo las rutas de sus poblaciones asignadas */
export async function getRutasPorPoblacion(supa: SupabaseClient, poblacionId: number): Promise<Opcion[]> {
  const me = getUser();

  // Si es capturista y la población NO está asignada, no retornamos nada.
  if (me?.rol === "CAPTURISTA") {
    const { data: ok, error: eok } = await supa
      .from("capturista_poblaciones")
      .select("id")
      .eq("capturista_id", me.id)
      .eq("poblacion_id", poblacionId)
      .eq("activo", true)
      .maybeSingle();
    if (eok) throw eok;
    if (!ok) return [];
  }

  const { data, error } = await supa
    .from("rutas")
    .select("id, nombre")
    .eq("poblacion_id", poblacionId)
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) }));
}

/* ========= Asignaciones ========= */

/** Asignar RUTA a capturista (idempotente) */
export async function assignRouteToCapturista(capturistaId: string, rutaId: number) {
  const { error } = await supabase
    .from("capturista_rutas")
    .upsert(
      { capturista_id: capturistaId, ruta_id: rutaId, activo: true },
      { onConflict: "capturista_id,ruta_id", ignoreDuplicates: false }
    );
  if (error) throw error;
}

/** Quitar RUTA (hard delete) */
export async function unassignRouteFromCapturista(capturistaId: string, rutaId: number) {
  const { error } = await supabase
    .from("capturista_rutas")
    .delete()
    .eq("capturista_id", capturistaId)
    .eq("ruta_id", rutaId);
  if (error) throw error;
}

/** Asignar POBLACIÓN y asegurar su RUTA asociada */
export async function assignPopulationToCapturista(capturistaId: string, poblacionId: number) {
  // 1) población
  const { error: e1 } = await supabase
    .from("capturista_poblaciones")
    .upsert(
      { capturista_id: capturistaId, poblacion_id: poblacionId, activo: true },
      { onConflict: "capturista_id,poblacion_id", ignoreDuplicates: false }
    );
  if (e1) throw e1;

  // 2) ruta de esa población
  const { data: pop, error: e2 } = await supabase
    .from("poblaciones")
    .select("ruta_id")
    .eq("id", poblacionId)
    .maybeSingle();
  if (e2) throw e2;

  if (pop?.ruta_id) await assignRouteToCapturista(capturistaId, pop.ruta_id);
}

/** Quitar POBLACIÓN (hard delete) */
export async function unassignPopulationFromCapturista(capturistaId: string, poblacionId: number) {
  const { error } = await supabase
    .from("capturista_poblaciones")
    .delete()
    .eq("capturista_id", capturistaId)
    .eq("poblacion_id", poblacionId);
  if (error) throw error;
}
