import React from "react";
import { useAutoUpdater } from "../hooks/useAutoUpdater";

export default function UpdaterButton() {
  const { status, progress, checkAndDownload, quitAndInstall } = useAutoUpdater();

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {status === "downloaded" ? (
        <button onClick={quitAndInstall} title="Reiniciar y aplicar actualización">
          Reiniciar para actualizar
        </button>
      ) : (
        <button onClick={checkAndDownload} title="Buscar actualizaciones">
          {status === "checking" || status === "downloading" ? "Buscando…" : "Buscar actualizaciones"}
        </button>
      )}

      {status === "downloading" && progress && (
        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {progress.percent.toFixed(0)}% (
            {Math.round(progress.transferred / 1024 / 1024)} / {Math.round(progress.total / 1024 / 1024)} MB)
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,.15)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%`, height: "100%" }} />
          </div>
        </div>
      )}

      {status.startsWith("error:") && <span style={{ color: "#f55", fontSize: 12 }}>Error al actualizar</span>}
      {status === "not-available" && <span style={{ fontSize: 12, opacity: 0.8 }}>No hay actualizaciones</span>}
      {status === "available" && <span style={{ fontSize: 12, opacity: 0.8 }}>Descargando…</span>}
    </div>
  );
}
