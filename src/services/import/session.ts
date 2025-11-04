// src/services/import/session.ts
import type { StageWorkbook } from "./staging";

const KEY_PREFIX = "baci/import_session/";

function keyFor(fileName?: string | null) {
  const base = (fileName || "workbook").trim().toLowerCase();
  return KEY_PREFIX + base;
}

export function saveSession(sw: StageWorkbook, alsoAsGeneric = true) {
  try {
    const payload = JSON.stringify(sw);
    localStorage.setItem(keyFor(sw.fileName), payload);
    if (alsoAsGeneric) localStorage.setItem(KEY_PREFIX + "_last", payload);
    return true;
  } catch { return false; }
}

export function loadSession(fileName?: string | null): StageWorkbook | null {
  try {
    const raw = localStorage.getItem(keyFor(fileName));
    if (raw) return JSON.parse(raw) as StageWorkbook;
    const last = localStorage.getItem(KEY_PREFIX + "_last");
    return last ? (JSON.parse(last) as StageWorkbook) : null;
  } catch { return null; }
}

export function clearSession(fileName?: string | null) {
  try {
    localStorage.removeItem(keyFor(fileName));
    localStorage.removeItem(KEY_PREFIX + "_last");
  } catch {}
}

export function hasSession(fileName?: string | null) {
  return !!localStorage.getItem(keyFor(fileName)) || !!localStorage.getItem(KEY_PREFIX + "_last");
}
