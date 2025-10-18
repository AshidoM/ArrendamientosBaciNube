// electron/main.ts — ESM seguro + auto-updates con UI
import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from "electron";
import path, { dirname } from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater"); // CJS

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
const isDev = !!process.env.VITE_DEV_SERVER_URL;

/** Busca el preload real en dist-electron */
function resolvePreload(): string {
  const candidates = [
    path.resolve(__dirname, "preload.js"),
    path.resolve(__dirname, "preload.cjs"),
    path.resolve(__dirname, "preload.mjs"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  // fallback
  return path.resolve(process.cwd(), "dist-electron", "preload.js");
}
const preload = resolvePreload();

// Rutas del renderer (Vite build con base: './')
const distDir   = path.resolve(__dirname, "..", "dist");
const indexHtml = path.resolve(distDir, "index.html");
const indexUrl  = pathToFileURL(indexHtml).toString();

let mainWin: BrowserWindow | null = null;

/** Menú con “Buscar actualizaciones…” */
function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: "File", submenu: [{ role: "quit" }] },
    { label: "Edit", submenu: [{ role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    {
      label: "Help",
      submenu: [
        {
          label: "Buscar actualizaciones…",
          click: async () => {
            try {
              const r = await autoUpdater.checkForUpdates();
              await dialog.showMessageBox({
                type: "info",
                title: "Actualizaciones",
                message: r?.updateInfo
                  ? `Disponible: ${r.updateInfo.version}`
                  : "No hay actualizaciones disponibles.",
              });
              if (r?.cancellationToken) {
                await autoUpdater.downloadUpdate(r.cancellationToken);
              }
            } catch (e: any) {
              dialog.showErrorBox("Error al buscar actualizaciones", String(e?.message || e));
            }
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Eventos + diálogos del autoUpdater */
function setupAutoUpdater() {
  (autoUpdater as any).logger = console;
  autoUpdater.autoDownload = false;            // descargamos nosotros tras check
  autoUpdater.autoInstallOnAppQuit = true;

  // Si NO se te genera app-update.yml, descomenta para fijar feed manual:
  // autoUpdater.setFeedURL({ provider: "github", owner: "AshidoM", repo: "ArrendamientosBaciNube" });

  autoUpdater.on("checking-for-update", () => {
    dialog.showMessageBox({ type: "info", message: "Buscando actualizaciones..." });
  });

  autoUpdater.on("update-available", (info) => {
    dialog.showMessageBox({
      type: "info",
      message: `Actualización disponible: ${info.version}. Iniciando descarga...`,
    }).then(() => autoUpdater.downloadUpdate()
      .catch(err => dialog.showErrorBox("Error al descargar", String(err))));
  });

  autoUpdater.on("update-not-available", () => {
    dialog.showMessageBox({ type: "info", message: "No hay actualizaciones disponibles." });
  });

  autoUpdater.on("download-progress", (p) => {
    mainWin?.setProgressBar((p.percent ?? 0) / 100);
  });

  autoUpdater.on("error", (err) => {
    mainWin?.setProgressBar(-1);
    dialog.showErrorBox("AutoUpdater error", String(err));
  });

  autoUpdater.on("update-downloaded", (info) => {
    mainWin?.setProgressBar(-1);
    dialog.showMessageBox({
      type: "question",
      buttons: ["Reiniciar ahora", "Luego"],
      defaultId: 0,
      cancelId: 1,
      message: `Actualización ${info.version} descargada.`,
      detail: "La aplicación se reiniciará para completar la instalación.",
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    });
  });

  // Endpoints por IPC si quieres desde renderer:
  ipcMain.handle("updates:check", async () => {
    const r = await autoUpdater.checkForUpdates();
    if (r?.cancellationToken) await autoUpdater.downloadUpdate(r.cancellationToken);
    return true;
  });
  ipcMain.handle("updates:quitAndInstall", async () => {
    autoUpdater.quitAndInstall(false, true);
    return true;
  });
}

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
    await mainWin.loadURL(indexUrl);
  }

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  buildMenu();
}

/** Single instance */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", (_event, _argv, _cwd) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  await createWindow();
  setupAutoUpdater();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", async () => { if (BrowserWindow.getAllWindows().length === 0) await createWindow(); });
