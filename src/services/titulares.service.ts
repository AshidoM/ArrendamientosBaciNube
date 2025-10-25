// src/services/titulares.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SujetoCredito } from "./montos.service";

export type TitularLite = { id: number; folio?: string | null; nombre: string };

/**
 * Busca titulares por nombre (clientes o coordinadoras).
 */
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

/**
 * Obtiene la asignación geo (población y ruta) del titular.
 * - CLIENTE: toma su población y su ruta (join).
 * - COORDINADORA: toma la población más reciente vinculada a la coordinadora y su ruta.
 */
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

    const p = (data as any)?.poblaciones;
    const r = p?.rutas;
    if (!p?.id || !r?.id) throw new Error("El cliente no tiene población/ruta asignadas.");
    return { poblacion_id: p.id, poblacion: p.nombre, ruta_id: r.id, ruta: r.nombre };
  }

  // COORDINADORA: tomamos una población asociada (la más reciente) y su ruta
  const { data, error } = await supabase
    .from("poblaciones")
    .select(`id, nombre, ruta_id, rutas:ruta_id ( id, nombre )`)
    .eq("coordinadora_id", titularId)
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw error;

  const p = data?.[0];
  const r = p?.rutas;
  if (!p?.id || !r?.id) throw new Error("La coordinadora no tiene población/ruta asignadas.");
  return { poblacion_id: p.id, poblacion: p.nombre, ruta_id: r.id, ruta: r.nombre };
}

/* ===========================
   NUEVO: para Renovación
   =========================== */

export type TitularGeoResumen = {
  sujeto: "CLIENTE" | "COORDINADORA";
  titular_id: number;
  nombre: string;
  poblacion_id: number;
  poblacion: string;
  ruta_id: number;
  ruta: string;
};

/**
 * Lee del crédito (por id) el sujeto, su titular y la geo (población/ruta) ya asignada.
 * Útil para renovación: con esto pintas nombre/población/ruta en la UI y
 * construyes el payload nuevo cumpliendo tus NOT NULL y CHECKs.
 */
export async function getTitularYGeoDeCredito(
  supabase: SupabaseClient,
  creditoId: number
): Promise<TitularGeoResumen> {
  const { data, error } = await supabase
    .from("creditos")
    .select(`
      id,
      sujeto,
      cliente_id,
      coordinadora_id,
      poblacion_id,
      ruta_id,
      cliente:cliente_id ( id, nombre ),
      coordinadora:coordinadora_id ( id, nombre ),
      poblacion:poblacion_id ( id, nombre ),
      ruta:ruta_id ( id, nombre )
    `)
    .eq("id", creditoId)
    .single();

  if (error) throw error;

  const sujeto = (data as any).sujeto as "CLIENTE" | "COORDINADORA";

  const titular_id =
    sujeto === "CLIENTE" ? Number((data as any).cliente_id) : Number((data as any).coordinadora_id);

  const nombre =
    sujeto === "CLIENTE"
      ? String((data as any)?.cliente?.nombre ?? "")
      : String((data as any)?.coordinadora?.nombre ?? "");

  const poblacion_id = Number((data as any).poblacion_id);
  const ruta_id = Number((data as any).ruta_id);

  const poblacion = String((data as any)?.poblacion?.nombre ?? "");
  const ruta = String((data as any)?.ruta?.nombre ?? "");

  if (!titular_id || !poblacion_id || !ruta_id) {
    throw new Error("El crédito no tiene completo el titular y/o la asignación de población/ruta.");
  }

  return { sujeto, titular_id, nombre, poblacion_id, poblacion, ruta_id, ruta };
}
