// src/services/poblaciones.service.ts
// Servicio de consulta para “Reportes → Poblaciones (resumen)”
// Mantiene compatibilidad con tu backend (/reportes/poblaciones/*),
// usa token de auth (sfgp_token|token) y pagina con page/limit.

/* ===================== Tipos ===================== */
export type ResumenRow = {
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

export type RutaOpt = { id: number; nombre: string };
export type OperadorOpt = { id: number; nombre: string };

/* ===================== Base URL ===================== */
const RAW_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
  "/api";

// Normaliza BASE evitando dobles “//”
const BASE = RAW_BASE.replace(/\/+$/, "");

/* ===================== Auth ===================== */
function getAuthToken(): string | null {
  return (
    localStorage.getItem("sfgp_token") ||
    localStorage.getItem("token") ||
    null
  );
}

/* ===================== HTTP helper ===================== */
async function request<T>(path: string, params?: Record<string, any>): Promise<T> {
  // Une BASE + path con tolerancia a prefijos
  const base = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`, window.location.origin);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers, method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
  }
  return (await res.json()) as T;
}

/* ===================== Catálogos ===================== */
export async function listRutas(): Promise<RutaOpt[]> {
  // Backend debe aceptar status=ACTIVO y limit
  const data = await request<RutaOpt[]>("/rutas", { status: "ACTIVO", limit: 1000 });
  return Array.isArray(data) ? data : [];
}

// Conservamos por compatibilidad (aunque hoy ya no filtres por operador en Reportes)
export async function listOperadores(): Promise<OperadorOpt[]> {
  const data = await request<OperadorOpt[]>("/operadores", { status: "ACTIVO", limit: 1000 });
  return Array.isArray(data) ? data : [];
}

/* ===================== Resumen (básico) ===================== */
export async function fetchResumenListado(input: {
  q?: string;            // texto a buscar (población/ruta/coordinadora)
  rutaNombre?: string;   // nombre de la ruta para filtrar
  from?: number;         // offset
  to?: number;           // offset+limit-1
}): Promise<{ rows: ResumenRow[]; total: number }> {
  const pageSize = Math.max(1, (input.to ?? 0) - (input.from ?? 0) + 1);
  const page = Math.floor((input.from ?? 0) / pageSize) + 1;

  const data = await request<{ rows: ResumenRow[]; total: number }>(
    "/reportes/poblaciones/resumen",
    {
      q: input.q,
      rutaNombre: input.rutaNombre,
      page,
      limit: pageSize,
    }
  );

  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    total: typeof data?.total === "number" ? data.total : 0,
  };
}

/* ===================== Resumen (advanced / compat) ===================== */
/* Aunque el UI actual ya no filtra por operador, dejamos esta función
   para módulos que aún la consuman. Puedes ignorar operadorId si no aplica. */
export async function fetchResumenListadoAdvanced(input: {
  q?: string;
  rutaNombre?: string;
  operadorId?: number;   // opcional; el backend puede ignorarlo
  fechaMin?: string;     // ISO (yyyy-mm-dd)
  fechaMax?: string;     // ISO (yyyy-mm-dd)
  from?: number;
  to?: number;
}): Promise<{ rows: ResumenRow[]; total: number }> {
  const pageSize = Math.max(1, (input.to ?? 0) - (input.from ?? 0) + 1);
  const page = Math.floor((input.from ?? 0) / pageSize) + 1;

  const data = await request<{ rows: ResumenRow[]; total: number }>(
    "/reportes/poblaciones/resumen-advanced",
    {
      q: input.q,
      rutaNombre: input.rutaNombre,
      operadorId: input.operadorId,
      fechaMin: input.fechaMin,
      fechaMax: input.fechaMax,
      page,
      limit: pageSize,
    }
  );

  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    total: typeof data?.total === "number" ? data.total : 0,
  };
}
