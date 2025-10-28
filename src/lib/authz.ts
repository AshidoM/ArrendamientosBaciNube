// src/lib/authz.ts
import { supabase } from "./supabase";
import { getUser } from "../auth";

type Id = number | string | bigint | null | undefined;

const toNum = (v: Id): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

type Role = "ADMIN" | "CAPTURISTA" | null;

type Cache = {
  popIds: number[];
  routeIds: number[];
  userId: string | null;
  ts: number;
  role: Role;
};

const TTL_MS = 30_000; // 30s de vigencia de caché
let mem: Cache = { popIds: [], routeIds: [], userId: null, ts: 0, role: null };

function isStale(uid: string) {
  return mem.userId !== uid || Date.now() - mem.ts > TTL_MS;
}

// ================================
// Rol del usuario
// ================================
export async function getMyRole(): Promise<"ADMIN" | "CAPTURISTA"> {
  const me = getUser();
  return (me?.rol as any) === "ADMIN" ? "ADMIN" : "CAPTURISTA";
}

// ================================
// IDs de Poblaciones asignadas
// ================================
export async function getMyAssignedPopulationIds(force = false): Promise<number[]> {
  const me = getUser();
  if (!me?.id) return [];

  const role = await getMyRole();
  // ADMIN no necesita restricciones; regresamos [] para indicar "sin filtro"
  if (role === "ADMIN") {
    mem = {
      ...mem,
      userId: me.id,
      ts: Date.now(),
      role,
      // No sobreescribimos popIds/routeIds aquí para no romper posibles lecturas previas
    };
    return [];
  }

  if (!force && !isStale(me.id) && mem.popIds.length) return mem.popIds.slice();

  const { data, error } = await supabase
    .from("capturista_poblaciones")
    .select("poblacion_id, activo")
    .eq("capturista_id", me.id);

  if (error) {
    console.error("authz:getMyAssignedPopulationIds", error);
    return mem.popIds.slice();
  }

  const ids = (data || [])
    .filter((r: any) => r.activo !== false)
    .map((r: any) => toNum(r.poblacion_id))
    .filter((n): n is number => n !== null);

  // Actualizamos caché
  mem.userId = me.id;
  mem.ts = Date.now();
  mem.role = role;
  mem.popIds = Array.from(new Set(ids));

  return mem.popIds.slice();
}

// ================================
// IDs de Rutas derivadas de mis poblaciones
// ================================
export async function getMyAssignedRouteIds(force = false): Promise<number[]> {
  const me = getUser();
  if (!me?.id) return [];

  const role = await getMyRole();
  // ADMIN sin filtro
  if (role === "ADMIN") {
    mem = {
      ...mem,
      userId: me.id,
      ts: Date.now(),
      role,
    };
    return [];
  }

  // Si caché vigente y ya tenemos routeIds, úsalo
  if (!force && !isStale(me.id) && mem.routeIds.length) return mem.routeIds.slice();

  // Obtenemos poblaciones asignadas primero (puede llenar caché)
  const popIds = await getMyAssignedPopulationIds(force);
  if (popIds.length === 0) {
    mem.userId = me.id;
    mem.ts = Date.now();
    mem.role = role;
    mem.routeIds = [];
    return [];
  }

  // Derivar rutas a partir de las poblaciones asignadas
  const { data, error } = await supabase
    .from("poblaciones")
    .select("id, ruta_id")
    .in("id", popIds);

  if (error) {
    console.error("authz:getMyAssignedRouteIds", error);
    return mem.routeIds.slice();
  }

  const routeIds = Array.from(
    new Set(
      (data || [])
        .map((r: any) => toNum(r.ruta_id))
        .filter((n): n is number => n !== null)
    )
  );

  mem.userId = me.id;
  mem.ts = Date.now();
  mem.role = role;
  mem.routeIds = routeIds;

  return mem.routeIds.slice();
}

// ================================
// Invalidar caché
// ================================
export function invalidateAuthzCache() {
  mem = { popIds: [], routeIds: [], userId: null, ts: 0, role: null };
}

// ================================
// Verificación de pertenencia de un crédito
// Soporta autorización por población o ruta
// ================================
export async function creditoPerteneceAlCapturista(credito: { poblacion_id?: Id; ruta_id?: Id }): Promise<boolean> {
  const me = getUser();
  if (!me?.id) return false;

  const role = await getMyRole();
  if (role === "ADMIN") return true;

  const [pops, routes] = await Promise.all([
    getMyAssignedPopulationIds(),
    getMyAssignedRouteIds(),
  ]);

  // Si el capturista no tiene asignaciones, no puede ver nada
  if (!pops.length && !routes.length) return false;

  const cp = toNum(credito.poblacion_id);
  if (cp !== null && pops.includes(cp)) return true;

  const cr = toNum(credito.ruta_id);
  if (cr !== null && routes.includes(cr)) return true;

  return false;
}
