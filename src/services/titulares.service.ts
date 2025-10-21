import type { SupabaseClient } from "@supabase/supabase-js";
import type { SujetoCredito } from "./montos.service";

export type TitularLite = { id: number; folio?: string | null; nombre: string };

export async function buscarTitulares(
  supabase: SupabaseClient,
  sujeto: SujetoCredito,
  q: string
): Promise<TitularLite[]> {
  const table = sujeto === "CLIENTE" ? "clientes" : "coordinadoras";
  const { data, error } = await supabase
    .from(table)
    .select("id, folio, nombre")
    .ilike("nombre", `%${q}%`)
    .order("id", { ascending: false })
    .limit(8);
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: r.id, folio: r.folio ?? null, nombre: r.nombre }));
}

export async function getAsignacionGeo(
  supabase: SupabaseClient,
  sujeto: SujetoCredito,
  titularId: number
): Promise<{ poblacion_id: number; poblacion: string; ruta_id: number; ruta: string }> {
  if (sujeto === "CLIENTE") {
    const { data, error } = await supabase
      .from("clientes")
      .select(`
        poblacion_id,
        poblaciones:poblacion_id (
          id, nombre, ruta_id,
          rutas:ruta_id ( id, nombre )
        )
      `)
      .eq("id", titularId)
      .single();
    if (error) throw error;
    const p = (data as any)?.poblaciones, r = p?.rutas;
    if (!p?.id || !r?.id) throw new Error("El cliente no tiene población/ruta asignadas.");
    return { poblacion_id: p.id, poblacion: p.nombre, ruta_id: r.id, ruta: r.nombre };
  }
  const { data, error } = await supabase
    .from("poblaciones")
    .select(`id, nombre, ruta_id, rutas:ruta_id ( id, nombre )`)
    .eq("coordinadora_id", titularId)
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw error;
  const p = data?.[0], r = p?.rutas;
  if (!p?.id || !r?.id) throw new Error("La coordinadora no tiene población/ruta asignadas.");
  return { poblacion_id: p.id, poblacion: p.nombre, ruta_id: r.id, ruta: r.nombre };
}
