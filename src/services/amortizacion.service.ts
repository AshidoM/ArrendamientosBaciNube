// src/services/amortizacion.service.ts
import { supabase } from "../lib/supabase";

/** Días en español (capitalizados) */
const DIAS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Normaliza diferentes formas de día a “Capitalizado” (incluye enums y sin acentos) */
export function normalizeDiaSemana(v?: string | null): string | null {
  if (!v) return null;
  const raw = v.toString().trim();

  const t = raw.toLowerCase();
  const idx = [
    "domingo", "lunes", "martes", "miércoles", "miercoles",
    "jueves", "viernes", "sábado", "sabado"
  ].indexOf(t);

  if (idx === -1) {
    // Intento por Date.getDay() si viene fecha
    const tryDate = new Date(raw);
    if (!Number.isNaN(tryDate.getTime())) return DIAS_ES[tryDate.getDay()];
    // Último recurso: capitalizar primera letra
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  // Mapa que conserva acentos correctos
  const map = ["Domingo","Lunes","Martes","Miércoles","Miércoles","Jueves","Viernes","Sábado","Sábado"];
  return map[idx];
}

/* ================= Helpers locales ================= */
function s(v: any) {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function buildDir(o: any): string | null {
  if (!o) return null;
  // Soporta múltiples campos; añadimos num_ext/num_int/cp si existen
  const partes = [
    s(o.calle),
    s(o.colonia),
    s(o.municipio),
    s(o.estado_mx),
    s(o.cp),
  ].filter(Boolean);

  if (partes.length) return partes.join(", ");
  return s(o.domicilio) ?? s(o.direccion) ?? null;
}

async function existe(nombre: string) {
  const { error } = await supabase.from(nombre as any).select("*").limit(1);
  return !error;
}

/* =============== Encabezado extendido =============== */
/**
 * Carga extendida: población/ruta/domicilios/aval + día real de cobranza (de poblaciones.dia_cobranza)
 * Se asegura de llenar:
 * - cliente_domicilio: para CLIENTE o COORDINADORA (mismo campo para que la UI no cambie)
 * - aval_nombre y aval_domicilio: desde relación M:N o, si no existe, por fallback de vista
 */
export async function fetchEncabezadoExtendido(creditoId: number): Promise<{
  poblacion: string | null;      // "Población, Municipio, Estado"
  ruta: string | null;           // Nombre de ruta
  cliente_domicilio: string | null; // Domicilio del titular (cliente o coordinadora)
  aval_nombre: string | null;
  aval_domicilio: string | null;
  dia_cobranza: string | null;   // Día real configurado en población (enum/texto)
}> {
  // Traemos lo mínimo del crédito para decidir el camino
  const { data: credRow, error: eCred } = await supabase
    .from("creditos")
    .select("id, poblacion_id, ruta_id, cliente_id, sujeto, coordinadora_id")
    .eq("id", creditoId)
    .maybeSingle();
  if (eCred) throw eCred;

  let poblacionNombre: string | null = null;
  let municipio: string | null = null;
  let estado_mx: string | null = null;
  let diaCobranza: string | null = null;
  let rutaNombre: string | null = null;

  let titular_domicilio: string | null = null; // se llamará cliente_domicilio en el retorno para mantener compatibilidad
  let aval_nombre: string | null = null;
  let aval_domicilio: string | null = null;

  /* ===== Población (incluye dia_cobranza enum public.dia_semana) ===== */
  if (credRow?.poblacion_id) {
    const { data: pop, error: ePop } = await supabase
      .from("poblaciones")
      .select("nombre, municipio, estado_mx, dia_cobranza")
      .eq("id", credRow.poblacion_id)
      .maybeSingle();
    if (ePop) throw ePop;

    poblacionNombre = (pop as any)?.nombre ?? null;
    municipio = (pop as any)?.municipio ?? null;
    estado_mx = (pop as any)?.estado_mx ?? null;
    diaCobranza = normalizeDiaSemana((pop as any)?.dia_cobranza) ?? null;
  }

  /* ===== Ruta ===== */
  if (credRow?.ruta_id) {
    const { data: r } = await supabase
      .from("rutas")
      .select("nombre")
      .eq("id", credRow.ruta_id)
      .maybeSingle();
    rutaNombre = (r as any)?.nombre ?? null;
  }

  /* ===== Titular y aval según sujeto ===== */
  if (credRow?.cliente_id) {
    // Titular = CLIENTE
    const { data: cli } = await supabase
      .from("clientes")
      .select("direccion, domicilio, calle, colonia, municipio, estado_mx, cp")
      .eq("id", credRow.cliente_id)
      .maybeSingle();
    titular_domicilio = buildDir(cli);

    // Aval por relación M:N (cliente_avales)
    const { data: rel } = await supabase
      .from("cliente_avales")
      .select("aval_id")
      .eq("cliente_id", credRow.cliente_id)
      .limit(1);
    const avalId = (rel?.[0] as any)?.aval_id;

    if (avalId) {
      const { data: a } = await supabase
        .from("avales")
        .select("nombre, direccion, domicilio, calle, colonia, municipio, estado_mx, cp")
        .eq("id", avalId)
        .maybeSingle();
      aval_nombre = (a as any)?.nombre ?? null;
      aval_domicilio = buildDir(a);
    }
  } else if (credRow?.coordinadora_id) {
    // Titular = COORDINADORA
    const { data: coo } = await supabase
      .from("coordinadoras")
      .select("direccion, domicilio, calle, colonia, municipio, estado_mx, cp")
      .eq("id", credRow.coordinadora_id)
      .maybeSingle();
    titular_domicilio = buildDir(coo);

    // Aval por relación M:N (coordinadora_avales)
    const { data: rel } = await supabase
      .from("coordinadora_avales")
      .select("aval_id")
      .eq("coordinadora_id", credRow.coordinadora_id)
      .limit(1);
    const avalId = (rel?.[0] as any)?.aval_id;

    if (avalId) {
      const { data: a } = await supabase
        .from("avales")
        .select("nombre, direccion, domicilio, calle, colonia, municipio, estado_mx, cp")
        .eq("id", avalId)
        .maybeSingle();
      aval_nombre = (a as any)?.nombre ?? null;
      aval_domicilio = buildDir(a);
    }
  }

  /* ===== Fallbacks si faltan datos (vista resumida) ===== */
  // Si no encontramos aval o domicilio del titular, intentamos la vista de listado que ya has usado.
  if (await existe("vw_listado_poblacion_detalle")) {
    const { data: vw } = await supabase
      .from("vw_listado_poblacion_detalle")
      .select("credito_id, titular_domicilio, aval_nombre, aval_domicilio")
      .eq("credito_id", credRow?.id ?? creditoId)
      .maybeSingle();

    if (vw) {
      if (!titular_domicilio) {
        titular_domicilio = (vw as any).titular_domicilio ?? titular_domicilio;
      }
      if (!aval_nombre) {
        aval_nombre = (vw as any).aval_nombre ?? aval_nombre;
      }
      if (!aval_domicilio) {
        aval_domicilio = (vw as any).aval_domicilio ?? aval_domicilio;
      }
    }
  }

  const poblacionFull = [poblacionNombre, municipio, estado_mx].filter(Boolean).join(", ") || null;

  return {
    poblacion: poblacionFull,
    ruta: rutaNombre,
    // Mantengo el nombre para que tu Amortizacion.tsx no cambie:
    cliente_domicilio: titular_domicilio,
    aval_nombre,
    aval_domicilio,
    dia_cobranza: diaCobranza,
  };
}
