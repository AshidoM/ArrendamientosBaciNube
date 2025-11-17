// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | `error:${string}`;

type UpdateProgress = { percent: number; transferred: number; total: number };

function bindChannel<T>(channel: string, cb: (payload: T) => void) {
  ipcRenderer.removeAllListeners(channel);
  const handler = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("baci", {
  updates: {
    // Abre el HUD/overlay en el renderer (si tu UI lo usa)
    open: () => ipcRenderer.send("updates:open"),

    // Busca y descarga (según config del main)
    check: () => ipcRenderer.invoke("updates:check") as Promise<{ ok: boolean; error?: string }>,

    // Reinicia e instala si ya se descargó
    quitAndInstall: () => ipcRenderer.invoke("updates:quitAndInstall") as Promise<void>,

    // Suscriptores
    onStatus: (cb: (status: UpdateStatus) => void) => bindChannel<UpdateStatus>("updates:status", cb),
    onProgress: (cb: (info: UpdateProgress) => void) => bindChannel<UpdateProgress>("updates:progress", cb),
  },
});
