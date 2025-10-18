import { supabase } from "./lib/supabase";
import bcrypt from "bcryptjs";

export type AppUser = {
  id: string;
  username: string;
  nombre_completo: string;
  rol: "ADMIN" | "CAPTURISTA" | string;
  estado: "ACTIVO" | "INACTIVO" | string;
  correo: string | null;
  telefono?: string | null;
  foto_url?: string | null;
  ine?: string | null;          // <— agregado
};

export async function loginLocal(username: string, password: string, remember = true): Promise<AppUser> {
  const { data, error } = await supabase
    .from("users_local")
    .select("id, username, nombre_completo, rol, estado, correo, telefono, foto_url, ine, password_hash, password")
    .eq("username", username)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Usuario o contraseña incorrectos");

  const hasHash = !!data.password_hash && typeof data.password_hash === "string";
  const ok = hasHash ? await bcrypt.compare(password, data.password_hash as string) : data.password === password;
  if (!ok) throw new Error("Usuario o contraseña incorrectos");

  const user: AppUser = {
    id: data.id,
    username: data.username,
    nombre_completo: data.nombre_completo,
    rol: data.rol,
    estado: data.estado,
    correo: data.correo,
    telefono: data.telefono ?? null,
    foto_url: data.foto_url ?? null,
    ine: data.ine ?? null,      // <— guardamos en sesión
  };

  (remember ? localStorage : sessionStorage).setItem("baci_user", JSON.stringify(user));
  return user;
}

export const getUser = (): AppUser | null =>
  JSON.parse(localStorage.getItem("baci_user") || "null") ??
  JSON.parse(sessionStorage.getItem("baci_user") || "null");

export function logout() {
  localStorage.removeItem("baci_user");
  sessionStorage.removeItem("baci_user");
}
export const getCurrentUser = getUser;

/* ===== Helpers “Recordarme” para Login.tsx ===== */
const REMEMBER_KEY = "baci_remember";
export function saveRememberCreds(username: string, password: string) {
  try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password })); } catch {}
}
export function getRememberCreds(): { username: string; password: string } | null {
  try { return JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null"); } catch { return null; }
}
export function clearRememberCreds() {
  try { localStorage.removeItem(REMEMBER_KEY); } catch {}
}
