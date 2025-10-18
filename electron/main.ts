// electron/main.ts — ESM-safe
import { app, BrowserWindow, Menu, shell, ipcMain } from "electron";
import path, { dirname } from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater");

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// === Rutas ===
function resolvePreload(): string {
  // Busca el archivo que realmente existe en el output
  const candidates = [
    path.resolve(__dirname, "preload.js"),
    path.resolve(__dirname, "preload.cjs"),
    path.resolve(__dirname, "preload.mjs"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // fallback para dev si compilas el preload a otro sitio
  return path.resolve(process.cwd(), "dist-electron", "preload.js");
}

const preload = resolvePreload();

const distDir   = path.resolve(__dirname, "..", "dist");
const indexHtml = path.resolve(distDir, "index.html");
const indexUrl  = pathToFileURL(indexHtml).toString();

// === Ventana principal ===
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
      webSecurity: !isDev,
    },
  });

  mainWin.once("ready-to-show", () => mainWin?.show());
  mainWin.on("closed", () => (mainWin = null));

  if (isDev) {
    await mainWin.loadURL(process.env.VITE_DEV_SERVER_URL!);
    mainWin.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWin.loadURL(indexUrl); // con base:'./' ya carga assets
  }

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  buildMenu();
}

// === Menú con “Buscar actualizaciones” ===
function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [{ role: "copy" }, { role: "paste" }, { role: "selectAll" }]
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }]
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Buscar actualizaciones…",
          click: () => {
            autoUpdater.checkForUpdates().catch(err =>
              mainWin?.webContents.send("updates:status", "error:" + String(err))
            );
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// === Auto-updater (events + IPC) ===
function setupAutoUpdater() {
  (autoUpdater as any).logger = console;
  autoUpdater.autoDownload = false;            // control desde UI/menú
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
    mainWin?.webContents.send("updates:status", "error:" + String(err));
  });
  autoUpdater.on("download-progress", (p) => {
    mainWin?.webContents.send("updates:progress", {
      percent: p.percent || 0,
      transferred: p.transferred || 0,
      total: p.total || 0,
    });
  });
  autoUpdater.on("update-downloaded", () => {
    mainWin?.webContents.send("updates:status", "downloaded");
  });

  // Si prefieres también vía IPC desde el renderer:
  ipcMain.handle("updates:check", async () => {
    const r = await autoUpdater.checkForUpdates();
    if (r?.cancellationToken) await autoUpdater.downloadUpdate(r.cancellationToken);
    return true;
  });
  ipcMain.handle("updates:quitAndInstall", async () => {
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  // Si usas provider "generic", podrías setear feed:
  // autoUpdater.setFeedURL({ url: "https://tu-dominio.com/updates" });
}

// === Ciclo de vida ===
if (!app.requestSingleInstanceLock()) {
  app.quit(); process.exit(0);
}
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.whenReady().then(async () => {
  await createWindow();
  setupAutoUpdater();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", async () => { if (BrowserWindow.getAllWindows().length === 0) await createWindow(); });
