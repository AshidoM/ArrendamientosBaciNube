// src/components/UpdatesHUD.tsx
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Download, CheckCircle, AlertTriangle, X, Power } from "lucide-react";

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | `error:${string}`;

type UpdateProgress = { percent: number; transferred: number; total: number };

declare global {
  interface Window {
    baci?: {
      updates: {
        open: () => void;
        check: () => Promise<{ ok: boolean; error?: string }>;
        quitAndInstall: () => Promise<void>;
        onStatus: (cb: (status: UpdateStatus) => void) => () => void;
        onProgress: (cb: (info: UpdateProgress) => void) => () => void;
      };
    };
  }
}

function prettyBytes(n: number) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = n;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(1)} ${u[i]}`;
}

export default function UpdatesHUD() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  const isError = useMemo(() => String(status).startsWith("error:"), [status]);

  useEffect(() => {
    if (!window.baci?.updates) return;

    // Abrir HUD cuando main mande "updates:open" (lo hacemos cambiando estado)
    const unsubStatus = window.baci.updates.onStatus((s) => {
      setStatus(s);
      setOpen(true);
      if (s === "not-available") {
        // autocerrar suave en 2.5s si no hay actualización
        setTimeout(() => setOpen(false), 2500);
      }
      if (s === "downloaded") setProgress({ percent: 100, transferred: 0, total: 0 });
    });

    const unsubProg = window.baci.updates.onProgress((p) => {
      setProgress(p);
      setOpen(true);
    });

    return () => {
      unsubStatus?.();
      unsubProg?.();
    };
  }, []);

  // Texto principal por estado
  const title = useMemo(() => {
    if (isError) return "Error en actualización";
    switch (status) {
      case "idle":
        return "Actualizador";
      case "checking":
        return "Buscando actualizaciones…";
      case "available":
        return "Actualización disponible";
      case "downloading":
        return "Descargando actualización…";
      case "downloaded":
        return "Actualización lista";
      case "not-available":
        return "No hay actualizaciones";
      default:
        return "Actualizador";
    }
  }, [status, isError]);

  const detail = useMemo(() => {
    if (isError) return String(status).slice("error:".length) || "unknown";
    if (status === "downloading" && progress) {
      const pct = (progress.percent ?? 0).toFixed(1);
      const tr = progress.transferred ? prettyBytes(progress.transferred) : "";
      const tot = progress.total ? prettyBytes(progress.total) : "";
      return `Progreso: ${pct}% ${tot ? `(${tr} / ${tot})` : ""}`;
    }
    if (status === "not-available") return "Ya estás en la última versión.";
    if (status === "available") return "Comenzando descarga…";
    if (status === "downloaded") return "La app se reiniciará para instalar.";
    if (status === "checking") return "Consultando el feed de actualizaciones…";
    return "";
  }, [status, progress, isError]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10030] flex items-start justify-center p-3 sm:p-6">
      <div
        className="bg-white/95 backdrop-blur border rounded-2 shadow-xl w-[min(520px,96vw)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="text-[13px] font-semibold flex items-center gap-2">
            {isError ? (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            ) : status === "downloaded" ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : status === "downloading" ? (
              <Download className="w-4 h-4" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            {title}
          </div>
          <button className="btn-ghost !h-7 !px-2 text-xs" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 text-[13px] grid gap-3">
          <div>{detail}</div>

          {/* Barra de progreso */}
          {(status === "downloading" || status === "downloaded") && (
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--baci-blue,#0ea5e9)] transition-[width] duration-150"
                style={{ width: `${Math.max(0, Math.min(100, progress?.percent ?? (status === "downloaded" ? 100 : 0)))}%` }}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              className="btn-outline btn--sm"
              onClick={() => setOpen(false)}
            >
              Cerrar
            </button>

            {status !== "downloading" && status !== "downloaded" && (
              <button
                className="btn-primary btn--sm"
                onClick={() => window.baci?.updates.check()}
                title="Buscar actualizaciones"
              >
                <RotateCcw className="w-4 h-4" /> Buscar
              </button>
            )}

            {status === "downloaded" && (
              <button
                className="btn-primary btn--sm"
                onClick={() => window.baci?.updates.quitAndInstall()}
                title="Reiniciar e instalar"
              >
                <Power className="w-4 h-4" /> Reiniciar e instalar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
