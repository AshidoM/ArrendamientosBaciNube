// electron/main.ts
import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from "electron";
import path, { dirname } from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater"); // CJS import

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
const isDev = !!process.env.VITE_DEV_SERVER_URL;

let mainWin: BrowserWindow | null = null;

// ----------------- resolver preload -----------------
function resolvePreload(): string {
  const candidates = [
    path.resolve(__dirname, "preload.js"),
    path.resolve(__dirname, "preload.cjs"),
    path.resolve(__dirname, "preload.mjs"),
    path.resolve(process.cwd(), "dist-electron", "preload.js"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  // último recurso
  return path.resolve(__dirname, "preload.js");
}
const preload = resolvePreload();

const distDir = path.resolve(__dirname, "..", "dist");
const indexHtml = path.resolve(distDir, "index.html");
const indexUrl = pathToFileURL(indexHtml).toString();

// ----------------- util: enviar eventos al renderer -----------------
function sendStatus(status: string) {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send("updates:status", status);
  }
}
function sendProgress(percent: number, transferred: number, total: number) {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send("updates:progress", { percent, transferred, total });
  }
}

// ----------------- ventanita nativa opcional de progreso -----------------
let progressWin: BrowserWindow | null = null;
function showProgressWindow(text: string) {
  if (progressWin && !progressWin.isDestroyed()) {
    setProgressText(text);
    progressWin.focus();
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
    webPreferences: { sandbox: true },
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
    </body></html>`;
  progressWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}
function setProgressText(text: string) {
  if (!progressWin || progressWin.isDestroyed()) return;
  progressWin.webContents
    .executeJavaScript(`document.getElementById('text').textContent=${JSON.stringify(text)};`)
    .catch(() => {});
}
function setProgressPercent(percent: number) {
  if (!progressWin || progressWin.isDestroyed()) return;
  const pct = Math.max(0, Math.min(100, percent));
  progressWin.webContents
    .executeJavaScript(`document.getElementById('fill').style.width='${pct}%';`)
    .catch(() => {});
}
function closeProgressWindow() {
  if (progressWin && !progressWin.isDestroyed()) progressWin.close();
  progressWin = null;
}

// ----------------- menú -----------------
function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: "File", submenu: [{ role: "quit", label: "Salir" }] },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Recargar" },
        { role: "toggleDevTools", label: "Toggle DevTools" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    {
      label: "Help",
      submenu: [
        {
          label: "Buscar actualizaciones…",
          click: () => {
            // 1) solicita que el renderer abra el HUD (si lo usa)
            if (mainWin && !mainWin.isDestroyed()) {
              mainWin.webContents.send("updates:open");
            }
            // 2) dispara check
            autoUpdater.checkForUpdates().catch((e: any) => {
              sendStatus(`error:${e?.message || "unknown"}`);
              dialog.showErrorBox("AutoUpdater", String(e?.message || e));
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ----------------- configuración AutoUpdater -----------------
function setupAutoUpdater() {
  (autoUpdater as any).logger = console;
  // estrategia: descarga automática + instala al salir
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  // Si no tienes app-update.yml, configura manualmente tu feed:
  // autoUpdater.setFeedURL({ provider: "github", owner: "TU_OWNER", repo: "TU_REPO" });

  // Eventos → enviar a renderer + (opcional) ventanita nativa
  autoUpdater.on("checking-for-update", () => {
    sendStatus("checking");
    showProgressWindow("Buscando actualizaciones…");
  });

  autoUpdater.on("update-available", (info) => {
    sendStatus("available");
    setProgressText(`Actualización ${info.version} disponible. Descargando…`);
  });

  autoUpdater.on("update-not-available", () => {
    sendStatus("not-available");
    closeProgressWindow();
    // Mensaje informativo (opcional); si tu HUD ya lo muestra, puedes quitar esto:
    dialog.showMessageBox({ type: "info", message: "No hay actualizaciones disponibles." }).catch(() => {});
  });

  autoUpdater.on("download-progress", (p) => {
    const pct = p?.percent ?? 0;
    sendStatus("downloading");
    sendProgress(pct, p.transferred ?? 0, p.total ?? 0);
    setProgressPercent(pct);
    setProgressText(`Descargando… ${pct.toFixed(1)}%`);
    mainWin?.setProgressBar(pct / 100);
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendStatus("downloaded");
    sendProgress(100, info?.files?.[0]?.size ?? 0, info?.files?.[0]?.size ?? 0);
    setProgressPercent(100);
    setProgressText("Descarga completa.");
    mainWin?.setProgressBar(-1);
    closeProgressWindow();
    // Aquí NO forzamos diálogo: tu HUD puede mostrar botón “Reiniciar e instalar”
    // Si quieres diálogo nativo, descomenta:
    // dialog.showMessageBox({
    //   type: "question",
    //   buttons: ["Reiniciar ahora", "Luego"],
    //   defaultId: 0, cancelId: 1,
    //   message: `Actualización ${info.version} descargada.`,
    //   detail: "La aplicación se reiniciará para completar la instalación."
    // }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(false, true); });
  });

  autoUpdater.on("error", (err) => {
    sendStatus(`error:${err?.message || String(err)}`);
    mainWin?.setProgressBar(-1);
    closeProgressWindow();
    dialog.showErrorBox("AutoUpdater error", String(err));
  });

  // IPC para acciones desde el renderer
  ipcMain.handle("updates:check", async () => {
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("updates:open");
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (e: any) {
      sendStatus(`error:${e?.message || "unknown"}`);
      return { ok: false, error: e?.message || "unknown" };
    }
  });

  ipcMain.handle("updates:quitAndInstall", async () => {
    try {
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    } catch {/* noop */}
  });

  ipcMain.on("updates:open", () => {
    sendStatus("idle");
  });
}

// ----------------- ventana principal -----------------
async function createWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: "#111316",
    title: "Arrendamientos BACI",
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

// ----------------- single instance -----------------
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

// ----------------- boot -----------------
app.whenReady().then(async () => {
  await createWindow();
  setupAutoUpdater();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
});
