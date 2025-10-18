// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("baci", {
  updates: {
    check: () => ipcRenderer.invoke("updates:check"),
    quitAndInstall: () => ipcRenderer.invoke("updates:quitAndInstall"),
    onStatus: (cb: (status: string) => void) => {
      const ch = "updates:status";
      ipcRenderer.removeAllListeners(ch);
      ipcRenderer.on(ch, (_e, s) => cb(s));
      return () => ipcRenderer.removeAllListeners(ch);
    },
    onProgress: (cb: (info: { percent: number; transferred: number; total: number }) => void) => {
      const ch = "updates:progress";
      ipcRenderer.removeAllListeners(ch);
      ipcRenderer.on(ch, (_e, i) => cb(i));
      return () => ipcRenderer.removeAllListeners(ch);
    }
  }
});
