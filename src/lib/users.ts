// src/lib/users.ts
import { supabase } from "./supabase";
import bcrypt from "bcryptjs";

export type RolUsuario = "ADMIN" | "CAPTURISTA" | string;
export type EstadoUsuario = "ACTIVO" | "INACTIVO" | string;

export type UserRow = {
  id: string;
  username: string;
  nombre_completo: string;
  rol: RolUsuario;
  estado: EstadoUsuario;
  ine: string | null;
  correo: string | null;
  telefono: string | null;
  foto_url: string | null;
  created_at: string;
  updated_at: string;
};

export type UsersQuery = {
  q?: string;          // búsqueda libre: INE | username | nombre
  estado?: "ACTIVO" | "INACTIVO" | "ALL";
  page?: number;       // 1-based
  limit?: number;      // filas por página
};

export type Page<T> = {
  rows: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
};

function normalizeStr(s?: string | null): string {
  return (s ?? "").trim();
}

export async function listUsers(params: UsersQuery): Promise<Page<UserRow>> {
  const page = Math.max(params.page ?? 1, 1);
  const limit = Math.max(params.limit ?? 10, 1);
  const from = (page - 1) * limit;
  const to = from + (limit - 1);

  const q = normalizeStr(params.q);
  const estado = params.estado && params.estado !== "ALL" ? params.estado : undefined;

  let query = supabase
    .from("vw_users_local")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (estado) query = query.eq("estado", estado);
  if (q) {
    query = query.or(
      [
        `ine.eq.${q}`,
        `ine.ilike.%${q}%`,
        `username.ilike.%${q}%`,
        `nombre_completo.ilike.%${q}%`,
      ].join(",")
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const total = count ?? 0;
  const pages = Math.max(Math.ceil(total / limit), 1);

  return { rows: (data ?? []) as UserRow[], total, page, pages, limit };
}

export async function createUser(input: {
  username: string;
  nombre_completo: string;
  rol: RolUsuario;
  estado?: EstadoUsuario;
  ine?: string | null;
  correo?: string | null;
  telefono?: string | null;
  foto_url?: string | null;
  password?: string | null;
}): Promise<UserRow> {
  const payload: any = {
    username: input.username.trim(),
    nombre_completo: input.nombre_completo.trim(),
    rol: input.rol,
    estado: input.estado ?? "ACTIVO",
    ine: input.ine?.trim() || null,
    correo: input.correo?.trim() || null,
    telefono: input.telefono?.trim() || null,
    foto_url: input.foto_url ?? null,
  };

  if (input.password && input.password.trim().length > 0) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(input.password, salt);
    payload.password_hash = hash;
    payload.password = null;
  }

  const { data, error } = await supabase
    .from("users_local")
    .insert(payload)
    .select("id, username, nombre_completo, rol, estado, ine, correo, telefono, foto_url, created_at, updated_at")
    .single();

  if (error) throw error;
  return data as UserRow;
}

export async function updateUser(id: string, input: {
  username?: string;
  nombre_completo?: string;
  rol?: RolUsuario;
  estado?: EstadoUsuario;
  ine?: string | null;
  correo?: string | null;
  telefono?: string | null;
  foto_url?: string | null;
}): Promise<UserRow> {
  const patch: any = {};
  if (input.username !== undefined) patch.username = input.username.trim();
  if (input.nombre_completo !== undefined) patch.nombre_completo = input.nombre_completo.trim();
  if (input.rol !== undefined) patch.rol = input.rol;
  if (input.estado !== undefined) patch.estado = input.estado;
  if (input.ine !== undefined) patch.ine = input.ine?.trim() || null;
  if (input.correo !== undefined) patch.correo = input.correo?.trim() || null;
  if (input.telefono !== undefined) patch.telefono = input.telefono?.trim() || null;
  if (input.foto_url !== undefined) patch.foto_url = input.foto_url;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("users_local")
    .update(patch)
    .eq("id", id)
    .select("id, username, nombre_completo, rol, estado, ine, correo, telefono, foto_url, created_at, updated_at")
    .single();

  if (error) throw error;
  return data as UserRow;
}

export async function setUserPassword(id: string, newPassword: string): Promise<void> {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(newPassword, salt);
  const { error } = await supabase
    .from("users_local")
    .update({ password_hash: hash, password: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function setUserEstado(id: string, estado: EstadoUsuario): Promise<void> {
  const { error } = await supabase
    .from("users_local")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase.from("users_local").delete().eq("id", id);
  if (error) throw error;
}

export type PoblacionRow = {
  id: number;
  folio: string | null;
  nombre: string;
  municipio: string;
  estado_mx: string;
};

export async function listPoblaciones(q?: string, limit = 200): Promise<PoblacionRow[]> {
  let query = supabase
    .from("poblaciones")
    .select("id, folio, nombre, municipio, estado_mx")
    .order("nombre", { ascending: true })
    .limit(limit);

  const s = normalizeStr(q);
  if (s) {
    query = query.or(
      [
        `nombre.ilike.%${s}%`,
        `municipio.ilike.%${s}%`,
        `estado_mx.ilike.%${s}%`,
        `folio.ilike.%${s}%`,
      ].join(",")
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PoblacionRow[];
}

export async function getUserPoblaciones(capturistaId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("capturista_poblaciones")
    .select("poblacion_id")
    .eq("capturista_id", capturistaId)
    .eq("activo", true);
  if (error) throw error;
  return (data ?? []).map((r) => r.poblacion_id);
}

export async function setUserPoblaciones(capturistaId: string, poblacionIds: number[]): Promise<void> {
  const { error: fnErr } = await supabase.rpc("fn_set_poblaciones_capturista", {
    _capturista: capturistaId,
    _poblaciones: poblacionIds,
  });
  if (!fnErr) return;

  let { error: delErr } = await supabase
    .from("capturista_poblaciones")
    .delete()
    .eq("capturista_id", capturistaId);
  if (delErr) throw delErr;

  if (poblacionIds.length > 0) {
    const rows = poblacionIds.map((pid) => ({
      capturista_id: capturistaId,
      poblacion_id: pid,
      activo: true,
      desde: new Date().toISOString().slice(0, 10),
    }));
    const { error: insErr } = await supabase.from("capturista_poblaciones").insert(rows);
    if (insErr) throw insErr;
  }
}
