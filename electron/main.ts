// electron/main.ts — Auto-updates con ventana de progreso y diálogos
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

// ---------- PRELOAD & RENDERER ----------
function resolvePreload(): string {
  const candidates = [
    path.resolve(__dirname, "preload.js"),
    path.resolve(__dirname, "preload.cjs"),
    path.resolve(__dirname, "preload.mjs"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return path.resolve(process.cwd(), "dist-electron", "preload.js");
}
const preload = resolvePreload();

const distDir   = path.resolve(__dirname, "..", "dist");
const indexHtml = path.resolve(distDir, "index.html");
const indexUrl  = pathToFileURL(indexHtml).toString();

let mainWin: BrowserWindow | null = null;

// ---------- VENTANA DE PROGRESO ----------
let progressWin: BrowserWindow | null = null;
function showProgressWindow(text: string) {
  if (progressWin && !progressWin.isDestroyed()) {
    progressWin.focus();
    setProgressText(text);
    return;
  }
  progressWin = new BrowserWindow({
    width: 380,
    height: 140,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Actualizador",
    parent: mainWin ?? undefined,
    modal: true,
    alwaysOnTop: true,
    useContentSize: true,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true }
  });

  const html = `
    <html><head><meta charset="utf-8">
      <style>
        body{font-family:system-ui,Segoe UI,Roboto,Arial;padding:16px;margin:0;background:#111316;color:#e6e6e6}
        h1{font-size:16px;margin:0 0 10px 0}
        #text{font-size:13px;margin-bottom:10px}
        .bar{height:8px;background:#2a2f36;border-radius:999px;overflow:hidden}
        .fill{height:100%;width:0%;background:#0ea5e9;transition:width .15s ease}
      </style>
    </head>
    <body>
      <h1>Actualizador</h1>
      <div id="text">${text}</div>
      <div class="bar"><div class="fill" id="fill"></div></div>
    </body></html>
  `;
  progressWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}

function setProgressText(text: string) {
  if (!progressWin || progressWin.isDestroyed()) return;
  progressWin.webContents.executeJavaScript(
    `document.getElementById('text').textContent = ${JSON.stringify(text)};`
  ).catch(()=>{});
}
function setProgressPercent(percent: number) {
  if (!progressWin || progressWin.isDestroyed()) return;
  const pct = Math.max(0, Math.min(100, percent));
  progressWin.webContents.executeJavaScript(
    `document.getElementById('fill').style.width='${pct}%';`
  ).catch(()=>{});
}
function closeProgressWindow() {
  if (progressWin && !progressWin.isDestroyed()) progressWin.close();
  progressWin = null;
}

// ---------- MENÚ ----------
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
              showProgressWindow("Buscando actualizaciones…");
              const r = await autoUpdater.checkForUpdates();
              if (!r?.updateInfo || r.updateInfo.version === app.getVersion()) {
                closeProgressWindow();
                await dialog.showMessageBox({
                  type: "info",
                  title: "Actualizaciones",
                  message: "No hay actualizaciones disponibles."
                });
              } else {
                setProgressText(`Disponible ${r.updateInfo.version}. Descargando…`);
                if (r.cancellationToken) {
                  await autoUpdater.downloadUpdate(r.cancellationToken);
                } else {
                  await autoUpdater.downloadUpdate();
                }
              }
            } catch (e: any) {
              closeProgressWindow();
              dialog.showErrorBox("Error al buscar actualizaciones", String(e?.message || e));
            }
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- AUTO-UPDATER ----------
function setupAutoUpdater() {
  (autoUpdater as any).logger = console;
  autoUpdater.autoDownload = false;          // descargamos nosotros tras check
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  // Si por algún motivo no se genera app-update.yml, descomenta:
  // autoUpdater.setFeedURL({ provider: "github", owner: "AshidoM", repo: "ArrendamientosBaciNube" });

  autoUpdater.on("checking-for-update", () => {
    showProgressWindow("Buscando actualizaciones…");
  });
  autoUpdater.on("update-available", (info) => {
    setProgressText(`Actualización ${info.version} disponible. Descargando…`);
  });
  autoUpdater.on("update-not-available", () => {
    closeProgressWindow();
    dialog.showMessageBox({ type: "info", message: "No hay actualizaciones disponibles." });
  });
  autoUpdater.on("download-progress", (p) => {
    const pct = p.percent ?? 0;
    setProgressPercent(pct);
    mainWin?.setProgressBar(pct / 100);
    setProgressText(`Descargando… ${pct.toFixed(1)}%`);
  });
  autoUpdater.on("error", (err) => {
    mainWin?.setProgressBar(-1);
    closeProgressWindow();
    dialog.showErrorBox("AutoUpdater error", String(err));
  });
  autoUpdater.on("update-downloaded", (info) => {
    mainWin?.setProgressBar(-1);
    setProgressPercent(100);
    setProgressText("Descarga completa.");
    dialog.showMessageBox({
      type: "question",
      buttons: ["Reiniciar ahora", "Luego"],
      defaultId: 0,
      cancelId: 1,
      message: `Actualización ${info.version} descargada.`,
      detail: "La aplicación se reiniciará para completar la instalación."
    }).then(({ response }) => {
      closeProgressWindow();
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    });
  });

  // IPC opcional por si quieres botones en el renderer
  ipcMain.handle("updates:check", async () => {
    showProgressWindow("Buscando actualizaciones…");
    const r = await autoUpdater.checkForUpdates();
    if (r?.cancellationToken) await autoUpdater.downloadUpdate(r.cancellationToken);
    return true;
  });
  ipcMain.handle("updates:quitAndInstall", async () => {
    autoUpdater.quitAndInstall(false, true);
    return true;
  });
}

// ---------- WINDOW ----------
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

  buildMenu();
}

// ---------- SINGLE INSTANCE ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

// ---------- BOOT ----------
app.whenReady().then(async () => {
  await createWindow();
  setupAutoUpdater();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", async () => { if (BrowserWindow.getAllWindows().length === 0) await createWindow(); });
