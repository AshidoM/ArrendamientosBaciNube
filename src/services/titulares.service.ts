// src/services/titulares.service.ts
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

/**
 * Obtiene la asignación geo del titular SIN depender de relaciones declaradas.
 *
 * Regla:
 * - CLIENTE:
 *    clientes.poblacion_id -> poblaciones(id,nombre,ruta_id) -> rutas(id,nombre)
 * - COORDINADORA (nuevo):
 *    1) coordinadoras.poblacion_id (fuente de verdad)
 *         -> poblaciones(id,nombre,ruta_id) -> rutas(id,nombre)
 *    2) Fallback si lo anterior es NULL:
 *         poblaciones where coordinadora_id = :titularId order by id desc limit 1
 *         -> rutas
 */
export async function getAsignacionGeoSafe(
  supabase: SupabaseClient,
  sujeto: SujetoCredito,
  titularId: number
): Promise<{ poblacion_id: number; poblacion: string; ruta_id: number; ruta: string }> {
  if (sujeto === "CLIENTE") {
    const { data: cli, error: e1 } = await supabase
      .from("clientes")
      .select("poblacion_id")
      .eq("id", titularId)
      .maybeSingle();
    if (e1) throw e1;

    const poblacion_id = Number((cli as any)?.poblacion_id ?? 0);
    if (!poblacion_id) throw new Error("El cliente no tiene población asignada.");

    const { data: pop, error: e2 } = await supabase
      .from("poblaciones")
      .select("id, nombre, ruta_id")
      .eq("id", poblacion_id)
      .maybeSingle();
    if (e2) throw e2;
    if (!pop?.id) throw new Error("No se encontró la población del cliente.");

    const rutaId = Number((pop as any)?.ruta_id ?? 0);
    if (!rutaId) throw new Error("La población no tiene ruta asociada.");

    const { data: ru, error: e3 } = await supabase
      .from("rutas")
      .select("id, nombre")
      .eq("id", rutaId)
      .maybeSingle();
    if (e3) throw e3;
    if (!ru?.id) throw new Error("No se encontró la ruta asociada a la población.");

    return {
      poblacion_id,
      poblacion: String((pop as any).nombre),
      ruta_id: rutaId,
      ruta: String((ru as any).nombre),
    };
  }

  // COORDINADORA — PRIMERO: coordinadoras.poblacion_id
  const { data: coord, error: eC } = await supabase
    .from("coordinadoras")
    .select("poblacion_id")
    .eq("id", titularId)
    .maybeSingle();
  if (eC) throw eC;

  let poblacionId = Number((coord as any)?.poblacion_id ?? 0);

  // FALLBACK: buscar en poblaciones.coordinadora_id si la columna en coordinadoras está vacía
  if (!poblacionId) {
    const { data: popList, error: eF } = await supabase
      .from("poblaciones")
      .select("id, nombre, ruta_id")
      .eq("coordinadora_id", titularId)
      .order("id", { ascending: false })
      .limit(1);
    if (eF) throw eF;

    const popFallback = popList?.[0];
    if (!popFallback?.id) {
      throw new Error("La coordinadora no tiene población/ruta asignadas.");
    }

    const rutaIdFB = Number((popFallback as any).ruta_id ?? 0);
    if (!rutaIdFB) throw new Error("La población asignada a la coordinadora no tiene ruta asociada.");

    const { data: ruFB, error: eRuFB } = await supabase
      .from("rutas")
      .select("id, nombre")
      .eq("id", rutaIdFB)
      .maybeSingle();
    if (eRuFB) throw eRuFB;
    if (!ruFB?.id) throw new Error("No se encontró la ruta asociada.");

    return {
      poblacion_id: Number(popFallback.id),
      poblacion: String(popFallback.nombre),
      ruta_id: rutaIdFB,
      ruta: String((ruFB as any).nombre),
    };
  }

  // Caso principal con coordinadoras.poblacion_id
  const { data: pop, error: eP } = await supabase
    .from("poblaciones")
    .select("id, nombre, ruta_id")
    .eq("id", poblacionId)
    .maybeSingle();
  if (eP) throw eP;
  if (!pop?.id) throw new Error("No se encontró la población asignada a la coordinadora.");

  const rutaId = Number((pop as any).ruta_id ?? 0);
  if (!rutaId) throw new Error("La población asignada a la coordinadora no tiene ruta asociada.");

  const { data: ru, error: eR } = await supabase
    .from("rutas")
    .select("id, nombre")
    .eq("id", rutaId)
    .maybeSingle();
  if (eR) throw eR;
  if (!ru?.id) throw new Error("No se encontró la ruta asociada.");

  return {
    poblacion_id: Number(pop.id),
    poblacion: String(pop.nombre),
    ruta_id: rutaId,
    ruta: String((ru as any).nombre),
  };
}

/* =========================== Renovación =========================== */

export type TitularGeoResumen = {
  sujeto: "CLIENTE" | "COORDINADORA";
  titular_id: number;
  nombre: string;
  poblacion_id: number;
  poblacion: string;
  ruta_id: number;
  ruta: string;
};

export async function getTitularYGeoDeCredito(
  supabase: SupabaseClient,
  creditoId: number
): Promise<TitularGeoResumen> {
  const { data, error } = await supabase
    .from("creditos")
    .select("id, sujeto, cliente_id, coordinadora_id, poblacion_id, ruta_id")
    .eq("id", creditoId)
    .single();
  if (error) throw error;

  const sujeto = (data as any).sujeto as "CLIENTE" | "COORDINADORA";
  const titular_id =
    sujeto === "CLIENTE" ? Number((data as any).cliente_id) : Number((data as any).coordinadora_id);
  const poblacion_id = Number((data as any).poblacion_id);
  const ruta_id = Number((data as any).ruta_id);

  let nombre = "";
  if (sujeto === "CLIENTE") {
    const { data: c } = await supabase
      .from("clientes")
      .select("nombre")
      .eq("id", titular_id)
      .maybeSingle();
    nombre = String((c as any)?.nombre ?? "");
  } else {
    const { data: c } = await supabase
      .from("coordinadoras")
      .select("nombre")
      .eq("id", titular_id)
      .maybeSingle();
    nombre = String((c as any)?.nombre ?? "");
  }

  const { data: p } = await supabase
    .from("poblaciones")
    .select("nombre")
    .eq("id", poblacion_id)
    .maybeSingle();
  const { data: r } = await supabase
    .from("rutas")
    .select("nombre")
    .eq("id", ruta_id)
    .maybeSingle();

  if (!titular_id || !poblacion_id || !ruta_id) {
    throw new Error("El crédito no tiene completo el titular y/o la asignación de población/ruta.");
  }

  return {
    sujeto,
    titular_id,
    nombre,
    poblacion_id,
    poblacion: String((p as any)?.nombre ?? ""),
    ruta_id,
    ruta: String((r as any)?.nombre ?? ""),
  };
}
