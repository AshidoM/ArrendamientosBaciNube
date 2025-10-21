import type { SupabaseClient } from "@supabase/supabase-js";

export type CostoPapeleria = {
  id: number;
  nombre: string;
  monto: number;
  activo: boolean;
};

export async function getCostosPapeleria(supabase: SupabaseClient): Promise<CostoPapeleria[]> {
  try {
    const { data, error } = await supabase
      .from("costos_papeleria")
      .select("id, monto, activo")
      .eq("activo", true)
      .order("monto", { ascending: true });

    if (error) throw error;

    const list = (data || []).map((r: any) => ({
      id: Number(r.id),
      monto: Number(r.monto),
      activo: !!r.activo,
      nombre: `Papelería ${Number(r.monto).toLocaleString("es-MX", {
        style: "currency", currency: "MXN", maximumFractionDigits: 2
      })}`,
    }));

    if (list.length === 0) {
      console.warn("Papelería: tabla vacía, usando fallback $150.");
      return [{ id: -1, nombre: "Papelería $150.00", monto: 150, activo: true }];
    }
    return list;
  } catch (e) {
    console.warn("Papelería: error al cargar, usando fallback $150.", e);
    return [{ id: -1, nombre: "Papelería $150.00", monto: 150, activo: true }];
  }
}
