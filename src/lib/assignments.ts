import { supabase } from "../lib/supabase";

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

/** Quitar RUTA (hard delete o marca inactivo; aquí hard delete) */
export async function unassignRouteFromCapturista(capturistaId: string, rutaId: number) {
  const { error } = await supabase
    .from("capturista_rutas")
    .delete()
    .eq("capturista_id", capturistaId)
    .eq("ruta_id", rutaId);
  if (error) throw error;
}

/** Asignar POBLACIÓN (también asegura la RUTA asociada) */
export async function assignPopulationToCapturista(capturistaId: string, poblacionId: number) {
  // 1) asigna población (idempotente)
  const { error: e1 } = await supabase
    .from("capturista_poblaciones")
    .upsert(
      { capturista_id: capturistaId, poblacion_id: poblacionId, activo: true },
      { onConflict: "capturista_id,poblacion_id", ignoreDuplicates: false }
    );
  if (e1) throw e1;

  // 2) trae ruta de esa población
  const { data: pop, error: e2 } = await supabase
    .from("poblaciones")
    .select("ruta_id")
    .eq("id", poblacionId)
    .maybeSingle();
  if (e2) throw e2;

  if (pop?.ruta_id) {
    await assignRouteToCapturista(capturistaId, pop.ruta_id);
  }
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
