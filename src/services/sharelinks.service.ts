// src/services/sharelinks.service.ts
import { supabase } from "../lib/supabase";

export type AmortLink = {
  id: string; // uuid
  credito_id: number;
  token: string;
  publico: boolean;
  vigencia_desde: string | null; // 'YYYY-MM-DD'
  vigencia_hasta: string | null; // 'YYYY-MM-DD'
  created_at: string;
};

/** Obtiene el enlace (si existe) para un crédito */
export async function fetchLinkByCredito(creditoId: number): Promise<AmortLink | null> {
  const { data, error } = await supabase
    .from("amort_links")
    .select("id, credito_id, token, publico, vigencia_desde, vigencia_hasta, created_at")
    .eq("credito_id", creditoId)
    .limit(1);
  if (error) throw error;
  return ((data || [])[0] as any) || null;
}

/** Crea (si no existe) y devuelve el link del crédito */
export async function ensureLinkForCredito(creditoId: number): Promise<AmortLink> {
  const existing = await fetchLinkByCredito(creditoId);
  if (existing) return existing;

  // token simple basado en uuid generado por Postgres
  const { data, error } = await supabase
    .from("amort_links")
    .insert({
      credito_id: creditoId,
      publico: false,
      vigencia_desde: null,
      vigencia_hasta: null,
    })
    .select("id, credito_id, token, publico, vigencia_desde, vigencia_hasta, created_at")
    .single();
  if (error) throw error;
  return data as any as AmortLink;
}

/** Actualiza visibilidad/vigencia */
export async function updateLinkMeta(
  linkId: string,
  patch: Partial<Pick<AmortLink, "publico" | "vigencia_desde" | "vigencia_hasta">>
): Promise<AmortLink> {
  const { data, error } = await supabase
    .from("amort_links")
    .update({
      publico: patch.publico,
      vigencia_desde: patch.vigencia_desde,
      vigencia_hasta: patch.vigencia_hasta,
    })
    .eq("id", linkId)
    .select("id, credito_id, token, publico, vigencia_desde, vigencia_hasta, created_at")
    .single();
  if (error) throw error;
  return data as any as AmortLink;
}

/** Construye URL pública evitando "localhost" en producción */
export function buildAmortPublicUrl(token: string): string {
  const base =
    import.meta?.env?.VITE_PUBLIC_BASE_URL?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:5173");
  // Ruta pública que renderiza la amortización por token (ajusta si usas HashRouter)
  const useHash = !!import.meta?.env?.VITE_HASH_ROUTER;
  return useHash ? `${base}/#/amortizacion?token=${token}` : `${base}/amortizacion?token=${token}`;
}
