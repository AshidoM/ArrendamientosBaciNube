// src/lib/storage.ts
import { supabase } from "./supabase";

export function getPublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("Usuarios").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export async function uploadUserAvatar(file: File, userId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `Fotos/${filename}`;

  const { error: upErr } = await supabase
    .storage
    .from("Usuarios")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (upErr) throw upErr;

  const publicUrl = getPublicUrl(path)!;
  return { path, publicUrl };
}
