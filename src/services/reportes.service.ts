// src/services/reportes.service.ts
import { supabase } from "../lib/supabase";
import { getMyAssignedPopulationIds, getMyAssignedRouteIds, getMyRole } from "../lib/authz";

/* ===== Tipos ===== */
export type RutaOpt = { id: number; nombre: string };

export type ResumenListadoRow = {
  poblacion_id: number;
  ruta: string | null;
  poblacion: string | null;
  coordinadora_principal: string | null;
  capturista: string | null;
  frecuencia_pago: string | null;
  fecha_proximo_pago: string | null;
  creditos_activos: number | null;
  ficha_total: number | null;
  cartera_vencida_total: number | null;
  cobro_semanal: number | null;
  operador: string | null;
};

/**
 * CredLite:
 * - adeudo_total / cartera_vencida / cobro_semana: SIN M15
 */
export type CredLite = {
  id: number;
  folio: string;
  sujeto: "CLIENTE" | "COORDINADORA" | string;
  titular: string;
  domicilio_titular: string | null;
  aval: string | null;
  domicilio_aval: string | null;
  semanas: number;
  cuota: number;
  tiene_m15: boolean;
  adeudo_total: number;
  cartera_vencida: number;
  semana_actual: number;
  vence_el: string | null;
  desde_cuando: string | null;
  estado: string;
  pagos_vencidos: number;
  cobro_semana: number;
  abonos_parciales: number;
  pagos_adelantados: number;
};

export type FichaPayload = {
  poblacion_id: number;
  poblacion_nombre: string;
  ruta_nombre: string | null;
  municipio: string | null;
  estado_mx: string | null;
  coordinadora_nombre: string | null;
  operador_nombre: string | null;
  frecuencia: string | null;
  proximo_pago: string | null;
  creditos_activos: number;
  cobro_semanal: number;
  cartera_vencida: number;
  ficha_total: number;
  creditos: CredLite[];
};

/* ===== Utils ===== */
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function s(v: any) {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}
async function existe(nombre: string) {
  const { error } = await supabase.from(nombre as any).select("*").limit(1);
  return !error;
}
function folioDe(r: any): string {
  if (r.folio_publico) return String(r.folio_publico);
  if (r.folio_manual) return String(r.folio_manual);
  if (r.folio_externo != null) return String(r.folio_externo);
  if (r.folio) return String(r.folio);
  return `CR-${r.id}`;
}
function buildDir(o: any): string | null {
  if (!o) return null;
  const partes = [s(o.calle), s(o.colonia), s(o.municipio), s(o.estado_mx)].filter(Boolean);
  if (partes.length) return partes.join(", ");
  return s(o.domicilio) ?? s(o.direccion) ?? null;
}

/* ==== Fechas locales sin shift ==== */
function parseYMD(iso?: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}
function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
const TODAY = parseYMD(todayYMD())!;

/* ===== Catálogos ===== */
export async function apiListRutas(): Promise<RutaOpt[]> {
  const { data, error } = await supabase.from("rutas").select("id,nombre,estado").order("nombre", { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((r: any) => String(r.estado || "").toUpperCase() === "ACTIVO")
    .map((r: any) => ({ id: Number(r.id), nombre: r.nombre })) as RutaOpt[];
}

/* ===== Listado Resumen ===== */
function mapResumenRow(r: any): ResumenListadoRow {
  return {
    poblacion_id: Number(r.poblacion_id ?? r.id ?? 0),
    ruta: r.ruta ?? r.ruta_nombre ?? null,
    poblacion: r.poblacion ?? r.poblacion_nombre ?? r.nombre ?? null,
    coordinadora_principal: r.coordinadora ?? r.coordinadora_principal ?? null,
    capturista: r.capturista ?? null,
    frecuencia_pago: r.frecuencia_pago ?? r.frecuencia ?? null,
    fecha_proximo_pago: r.fecha_proximo_pago ?? r.proximo_pago ?? null,
    creditos_activos: n(r.creditos_activos ?? r.activos ?? 0),
    ficha_total: n(r.ficha_total),
    cartera_vencida_total: n(r.cartera_vencida_total ?? r.cartera_vencida ?? 0),
    cobro_semanal: n(r.cobro_semanal),
    operador: r.operador ?? r.operadores ?? null,
  };
}

export async function apiResumenListado(input: {
  rutaNombre?: string;
  q?: string;
  from: number;
  to: number;
}): Promise<{ rows: ResumenListadoRow[]; total: number }> {
  const offset = Math.max(0, input.from ?? 0);
  const limit = Math.max(1, (input.to ?? 0) - offset + 1);

  if (!(await existe("vw_poblacion_resumen_listado"))) {
    return { rows: [], total: 0 };
  }

  let q = supabase
    .from("vw_poblacion_resumen_listado")
    .select("*", { count: "exact" })
    .order("poblacion", { ascending: true })
    .range(offset, offset + limit - 1);

  if (input.rutaNombre?.trim()) q = q.eq("ruta", input.rutaNombre.trim());
  if (input.q?.trim()) {
    const term = input.q.trim();
    q = q.or(`poblacion.ilike.%${term}%,coordinadora_principal.ilike.%${term}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  const rows = (data || []).map(mapResumenRow);
  return { rows, total: count ?? rows.length };
}

/* ===== Resumen por población ===== */
export async function apiResumenPoblacion(poblacionId: number) {
  if (await existe("vw_poblacion_resumen_listado")) {
    const { data } = await supabase.from("vw_poblacion_resumen_listado").select("*").eq("poblacion_id", poblacionId).maybeSingle();
    if (data) {
      return {
        creditos_activos: n((data as any).creditos_activos),
        cobro_semanal: n((data as any).cobro_semanal),
        cartera_vencida: n((data as any).cartera_vencida_total ?? (data as any).cartera_vencida ?? 0),
        ficha_total: n((data as any).ficha_total),
        frecuencia: (data as any).frecuencia_pago ?? (data as any).frecuencia ?? null,
        proximo_pago: (data as any).fecha_proximo_pago ?? (data as any).proximo_pago ?? null,
        coordinadora_nombre: (data as any).coordinadora_principal ?? null,
        operador_nombre: (data as any).operador ?? null,
      };
    }
  }
  return {
    creditos_activos: 0,
    cobro_semanal: 0,
    cartera_vencida: 0,
    ficha_total: 0,
    frecuencia: null,
    proximo_pago: null,
    coordinadora_nombre: null,
    operador_nombre: null,
  };
}

/* ===== Helper: de dónde leer cuotas ===== */
async function cuotasSource(): Promise<"vw_creditos_cuotas" | "creditos_cuotas"> {
  if (await existe("vw_creditos_cuotas")) return "vw_creditos_cuotas";
  return "creditos_cuotas";
}

/* ===== Lógica de cálculo común (adelantados / cobro) ===== */
function calcularMetricasCuotas(arr: any[], cuotaRefInicial?: number) {
  let ade = 0;
  let venc = 0;
  let sAct = 0;
  let saldoFavor = 0; // solo se usa para ajustar cobro actual
  let abonosParciales = 0;
  let pagosAdelantados = 0;

  let cuotaRef = n(cuotaRefInicial);
  if (!cuotaRef && arr.length) {
    const w1 = arr.find((x) => n(x.num_semana) === 1);
    cuotaRef = n(w1?.monto_programado) || n(arr[0]?.monto_programado) || 0;
  }

  let baseDeudaProxima: number | null = null;

  for (const q of arr) {
    const programado = n(q.monto_programado);
    const abonado = n(q.abonado);
    const debe = Math.max(0, programado - abonado);

    ade += debe;

    const est = String(q.estado || "").toUpperCase();
    const f = parseYMD(q.fecha_programada);
    const esFuturo = !!f && f >= TODAY;

    if ((est === "VENCIDA" || est === "OMISA") && debe > 0) {
      venc += debe;
    }

    if (sAct === 0 && debe > 0) {
      sAct = n(q.num_semana);
    }

    if (abonado > 0 && abonado < programado) {
      abonosParciales += abonado;
    }

    const extra = abonado - programado;
    if (extra > 0) saldoFavor += extra;

    if (baseDeudaProxima == null && esFuturo) {
      baseDeudaProxima = debe;
    }

    if (esFuturo && abonado >= programado && programado > 0) {
      pagosAdelantados += 1;
    }
  }

  if (baseDeudaProxima == null) baseDeudaProxima = 0;
  const cobro_semana = Math.max(n(baseDeudaProxima) + venc - saldoFavor, 0);

  if (sAct === 0 && arr.length) {
    sAct = n(arr[arr.length - 1].num_semana);
  }

  return {
    adeudo_total: ade,
    cartera_vencida: venc,
    semana_actual: Math.max(1, sAct || 1),
    cobro_semana,
    abonos_parciales: Number(abonosParciales.toFixed(2)),
    pagos_adelantados: pagosAdelantados,
    cuota_ref: cuotaRef,
  };
}

/* ===== Créditos por población ===== */
export async function apiListCreditosDePoblacion(poblacionId: number): Promise<CredLite[]> {
  const cuotasTbl = await cuotasSource();

  /* === Caso 1: vista vw_listado_poblacion_detalle === */
  if (await existe("vw_listado_poblacion_detalle")) {
    const { data, error } = await supabase
      .from("vw_listado_poblacion_detalle")
      .select(
        [
          "credito_id",
          "folio_credito",
          "poblacion_id",
          "sujeto",
          "titular",
          "titular_domicilio",
          "aval_nombre",
          "aval_domicilio",
          "cuota",
          "m15_activa",
          "adeudo_total",
          "plazo_semanas",
          "primer_pago",
          "fecha_disposicion",
          "cuota_vencida_monto",
        ].join(",")
      )
      .eq("poblacion_id", poblacionId)
      .order("credito_id", { ascending: true });

    if (error) throw error;

    const ids = (data || []).map((r: any) => Number(r.credito_id));
    if (ids.length === 0) return [];

    const { data: credInfo, error: eCred } = await supabase
      .from("creditos")
      .select("id, folio, folio_publico, folio_manual, folio_externo")
      .in("id", ids);
    if (eCred) throw eCred;

    const foliosById = new Map<number, string>();
    (credInfo || []).forEach((c: any) => {
      const id = Number(c.id);
      foliosById.set(id, folioDe(c));
    });

    const { data: cuo, error: e1 } = await supabase
      .from(cuotasTbl as any)
      .select("credito_id, num_semana, monto_programado, abonado, estado, fecha_programada")
      .in("credito_id", ids);
    if (e1) throw e1;

    const by = new Map<number, any[]>();
    (cuo || []).forEach((r: any) => {
      const k = Number(r.credito_id);
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(r);
    });

    return (data || []).map((r: any) => {
      const id = Number(r.credito_id);
      const arr = (by.get(id) || []).sort((a, b) => n(a.num_semana) - n(b.num_semana));
      const semanas = n(r.plazo_semanas) || arr.length;

      let cuota = n(r.cuota);
      if (!cuota && arr.length) {
        const w1 = arr.find((x) => n(x.num_semana) === 1);
        cuota = n(w1?.monto_programado);
      }

      const calc = calcularMetricasCuotas(arr, cuota);

      const folio =
        foliosById.get(id) ??
        (r as any).folio_publico ??
        (r as any).folio_externo ??
        (r as any).folio_manual ??
        r.folio_credito ??
        `CR-${id}`;

      const pagos_vencidos = cuota > 0 ? Number((calc.cartera_vencida / cuota).toFixed(2)) : 0;

      return {
        id,
        folio: String(folio),
        sujeto: r.sujeto ?? "CLIENTE",
        titular: r.titular ?? "—",
        domicilio_titular: r.titular_domicilio ?? null,
        aval: r.aval_nombre ?? null,
        domicilio_aval: r.aval_domicilio ?? null,
        semanas,
        cuota,
        tiene_m15: !!r.m15_activa,
        adeudo_total: calc.adeudo_total,
        cartera_vencida: calc.cartera_vencida,
        semana_actual: calc.semana_actual,
        vence_el: arr.length ? s(arr[arr.length - 1].fecha_programada) : null,
        desde_cuando: s(r.fecha_disposicion) ?? (arr.length ? s(arr[0].fecha_programada) : null),
        estado: "ACTIVO",
        pagos_vencidos,
        cobro_semana: calc.cobro_semana,
        abonos_parciales: calc.abonos_parciales,
        pagos_adelantados: calc.pagos_adelantados,
      } as CredLite;
    });
  }

  /* === Caso 2: tablas base === */
  const { data: base, error: e0 } = await supabase
    .from("creditos")
    .select(
      [
        "id",
        "folio",
        "folio_externo",
        "folio_publico",
        "folio_manual",
        "sujeto",
        "estado",
        "created_at",
        "cliente_id",
        "coordinadora_id",
        "poblacion_id",
        "cuota_semanal",
        "fecha_disposicion",
        "primer_pago",
      ].join(",")
    )
    .eq("poblacion_id", poblacionId)
    .order("id", { ascending: true });
  if (e0) throw e0;

  const ids = (base || []).map((r: any) => Number(r.id));
  if (ids.length === 0) return [];

  const { data: cuo, error: e1 } = await supabase
    .from(cuotasTbl as any)
    .select("credito_id, num_semana, monto_programado, abonado, estado, fecha_programada")
    .in("credito_id", ids);
  if (e1) throw e1;

  let m15ByCred: Record<number, boolean> = {};
  if (await existe("v_credito_m15")) {
    const { data: m15 } = await supabase.from("v_credito_m15").select("credito_id, m15_activa").in("credito_id", ids);
    (m15 || []).forEach((r: any) => (m15ByCred[Number(r.credito_id)] = !!r.m15_activa));
  } else {
    const { data: m } = await supabase.from("multas").select("credito_id, activa").in("credito_id", ids);
    (m || []).forEach((r: any) => {
      const cid = Number(r.credito_id);
      m15ByCred[cid] = m15ByCred[cid] || !!r.activa;
    });
  }

  const clienteIds = Array.from(new Set((base || []).map((r: any) => r.cliente_id).filter((x: any) => x != null)));
  const coordIds = Array.from(new Set((base || []).map((r: any) => r.coordinadora_id).filter((x: any) => x != null)));

  const [clientesResp, coordsResp] = await Promise.all([
    clienteIds.length
      ? supabase.from("clientes").select("id,nombre,domicilio,direccion,calle,colonia,municipio,estado_mx").in("id", clienteIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    coordIds.length
      ? supabase.from("coordinadoras").select("id,nombre,domicilio,direccion,calle,colonia,municipio,estado_mx").in("id", coordIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const cliMap = new Map<number, any>();
  (clientesResp.data || []).forEach((c: any) => cliMap.set(Number(c.id), c));
  const cooMap = new Map<number, any>();
  (coordsResp.data || []).forEach((c: any) => cooMap.set(Number(c.id), c));

  let avalByCliente: Record<number, any> = {};
  let avalByCoord: Record<number, any> = {};

  if (clienteIds.length && (await existe("cliente_avales"))) {
    const { data: ca } = await supabase.from("cliente_avales").select("cliente_id, aval_id").in("cliente_id", clienteIds);
    const avalIds = Array.from(new Set((ca || []).map((r: any) => r.aval_id)));
    if (avalIds.length) {
      const { data: avales } = await supabase
        .from("avales")
        .select("id,nombre,domicilio,direccion,calle,colonia,municipio,estado_mx")
        .in("id", avalIds);
      const avMap = new Map<number, any>();
      (avales || []).forEach((a: any) => avMap.set(Number(a.id), a));
      (ca || []).forEach((r: any) => {
        const cid = Number(r.cliente_id);
        if (!avalByCliente[cid]) avalByCliente[cid] = avMap.get(Number(r.aval_id)) || null;
      });
    }
  }

  if (coordIds.length && (await existe("coordinadora_avales"))) {
    const { data: ca } = await supabase.from("coordinadora_avales").select("coordinadora_id, aval_id").in("coordinadora_id", coordIds);
    const avalIds = Array.from(new Set((ca || []).map((r: any) => r.aval_id)));
    if (avalIds.length) {
      const { data: avales } = await supabase
        .from("avales")
        .select("id,nombre,domicilio,direccion,calle,colonia,municipio,estado_mx")
        .in("id", avalIds);
      const avMap = new Map<number, any>();
      (avales || []).forEach((a: any) => avMap.set(Number(a.id), a));
      (ca || []).forEach((r: any) => {
        const cid = Number(r.coordinadora_id);
        if (!avalByCoord[cid]) avalByCoord[cid] = avMap.get(Number(r.aval_id)) || null;
      });
    }
  }

  const by = new Map<number, any[]>();
  (cuo || []).forEach((r: any) => {
    const k = Number(r.credito_id);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(r);
  });

  return (base || []).map((r: any) => {
    const id = Number(r.id);
    const isCliente = r.sujeto === "CLIENTE";
    const titularObj = isCliente ? cliMap.get(Number(r.cliente_id)) : cooMap.get(Number(r.coordinadora_id));
    const titularNombre = titularObj?.nombre ?? "—";
    const domTit = buildDir(titularObj);

    let avalNombre: string | null = null;
    let avalDom: string | null = null;
    if (isCliente && r.cliente_id != null) {
      const avalObj = avalByCliente[Number(r.cliente_id)];
      if (avalObj) {
        avalNombre = avalObj.nombre ?? null;
        avalDom = buildDir(avalObj);
      }
    } else if (!isCliente && r.coordinadora_id != null) {
      const avalObj = avalByCoord[Number(r.coordinadora_id)];
      if (avalObj) {
        avalNombre = avalObj.nombre ?? null;
        avalDom = buildDir(avalObj);
      }
    }

    const arr = (by.get(id) || []).sort((a, b) => n(a.num_semana) - n(b.num_semana));
    const semanas = arr.length;
    const cuota = n(arr.find((x) => n(x.num_semana) === 1)?.monto_programado) || n(r.cuota_semanal);

    const calc = calcularMetricasCuotas(arr, cuota);
    const pagos_vencidos = cuota > 0 ? Number((calc.cartera_vencida / cuota).toFixed(2)) : 0;

    return {
      id,
      folio: folioDe(r),
      sujeto: r.sujeto,
      titular: titularNombre,
      domicilio_titular: domTit,
      aval: avalNombre,
      domicilio_aval: avalDom,
      semanas,
      cuota,
      tiene_m15: !!m15ByCred[id],
      adeudo_total: calc.adeudo_total,
      cartera_vencida: calc.cartera_vencida,
      semana_actual: calc.semana_actual,
      vence_el: arr.length ? s(arr[arr.length - 1].fecha_programada) : null,
      desde_cuando: s(r.fecha_disposicion) ?? (arr.length ? s(arr[0].fecha_programada) : s(r.created_at) ?? null),
      estado: r.estado ?? "—",
      pagos_vencidos,
      cobro_semana: calc.cobro_semana,
      abonos_parciales: calc.abonos_parciales,
      pagos_adelantados: calc.pagos_adelantados,
    } as CredLite;
  });
}

/* ===== Build payload para PDF ===== */
export async function buildFichaDePoblacion(poblacionId: number): Promise<FichaPayload> {
  const { data: pop, error: e0 } = await supabase
    .from("poblaciones")
    .select("id,nombre,municipio,estado_mx,ruta_id,rutas:ruta_id(nombre),coordinadora_id,operador_id")
    .eq("id", poblacionId)
    .maybeSingle();
  if (e0) throw e0;
  if (!pop) throw new Error(`Población ${poblacionId} no encontrada`);

  const [resumen, creditos] = await Promise.all([apiResumenPoblacion(poblacionId), apiListCreditosDePoblacion(poblacionId)]);

  return {
    poblacion_id: poblacionId,
    poblacion_nombre: pop.nombre,
    ruta_nombre: pop.rutas?.nombre ?? (pop.ruta_id ? `Ruta ${pop.ruta_id}` : null),
    municipio: pop.municipio ?? null,
    estado_mx: pop.estado_mx ?? null,
    coordinadora_nombre: resumen.coordinadora_nombre ?? null,
    operador_nombre: resumen.operador_nombre ?? null,
    frecuencia: resumen.frecuencia ?? null,
    proximo_pago: resumen.proximo_pago ?? null,
    creditos_activos: resumen.creditos_activos,
    cobro_semanal: resumen.cobro_semanal,
    cartera_vencida: resumen.cartera_vencida,
    ficha_total: resumen.ficha_total,
    creditos,
  };
}

/* Aliases */
export const apiListPoblaciones = async (offset: number, limit: number, search?: string) => {
  const role = await getMyRole();
  const isAdmin = role === "ADMIN";

  let q = supabase
    .from("poblaciones")
    .select("id,nombre,municipio,estado_mx,ruta_id,estado,rutas:ruta_id(nombre)", { count: "exact" })
    .order("nombre", { ascending: true })
    .range(offset, offset + limit - 1);

  if (!isAdmin) {
    const [popIds, routeIds] = await Promise.all([getMyAssignedPopulationIds(), getMyAssignedRouteIds()]);
    if ((popIds?.length ?? 0) === 0 && (routeIds?.length ?? 0) === 0) {
      return { rows: [], total: 0 };
    }
    if (popIds.length && routeIds.length) {
      q = q.or(`id.in.(${popIds.join(",")}),ruta_id.in.(${routeIds.join(",")})`);
    } else if (popIds.length) {
      q = q.in("id", popIds);
    } else if (routeIds.length) {
      q = q.in("ruta_id", routeIds);
    }
  }

  if (search?.trim()) {
    const term = search.trim();
    q = q.or(`nombre.ilike.%${term}%,municipio.ilike.%${term}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  const rows = (data || []).map((r: any) => ({
    id: Number(r.id),
    nombre: r.nombre,
    municipio: r.municipio ?? null,
    estado_mx: r.estado_mx ?? null,
    ruta_id: r.ruta_id ?? null,
    ruta_nombre: r.rutas?.nombre ?? null,
    estado: r.estado ?? null,
  }));
  return { rows, total: count ?? rows.length };
};
