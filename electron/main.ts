// electron/main.ts
import { app, BrowserWindow, shell, ipcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { autoUpdater } from "electron-updater";

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Rutas build
const preload = path.resolve(__dirname, "preload.cjs");
const distDir  = path.resolve(__dirname, "..", "dist");
const indexHtml = path.resolve(distDir, "index.html");
const indexUrl  = pathToFileURL(indexHtml).toString();

// (Opcional) “modo portable”: guarda userData junto al .exe si PORTABLE_MODE=1
try {
  if (process.env.PORTABLE_MODE === "1") {
    const exeDir = path.dirname(app.getPath("exe"));
    app.setPath("userData", path.join(exeDir, "UserData"));
  }
} catch {}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

let mainWin: BrowserWindow | null = null;

async function createWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: "#111316",
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: !isDev
    }
  });

  mainWin.once("ready-to-show", () => mainWin?.show());
  mainWin.on("closed", () => (mainWin = null));

  if (isDev) {
    await mainWin.loadURL(process.env.VITE_DEV_SERVER_URL!);
    mainWin.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWin.loadURL(indexUrl);
  }

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function setupAutoUpdater() {
  autoUpdater.logger = console as any;
  autoUpdater.autoDownload = false; // descarga sólo cuando tú lo pidas
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    mainWin?.webContents.send("updates:status", "checking");
  });
  autoUpdater.on("update-available", () => {
    mainWin?.webContents.send("updates:status", "available");
  });
  autoUpdater.on("update-not-available", () => {
    mainWin?.webContents.send("updates:status", "not-available");
  });
  autoUpdater.on("error", (err) => {
    mainWin?.webContents.send("updates:status", `error:${String(err)}`);
  });
  autoUpdater.on("download-progress", (p) => {
    mainWin?.webContents.send("updates:progress", {
      percent: p.percent || 0,
      transferred: p.transferred || 0,
      total: p.total || 0
    });
  });
  autoUpdater.on("update-downloaded", () => {
    mainWin?.webContents.send("updates:status", "downloaded");
  });

  ipcMain.handle("updates:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo && result?.cancellationToken) {
        await autoUpdater.downloadUpdate(result.cancellationToken);
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle("updates:quitAndInstall", async () => {
    try {
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  // Si usas "generic" en package.json:
  // autoUpdater.setFeedURL({ url: "https://tu-dominio.com/updates" });
}

app.whenReady().then(async () => {
  await createWindow();
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
});
