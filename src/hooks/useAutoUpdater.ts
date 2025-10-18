import { useEffect, useState } from "react";

export function useAutoUpdater() {
  const [status, setStatus] = useState<
    "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | `error:${string}`
  >("idle");
  const [progress, setProgress] = useState<{ percent: number; transferred: number; total: number } | null>(null);

  useEffect(() => {
    const off1 = window.baci.updates.onStatus((s) => {
      if (s === "checking") setStatus("checking");
      else if (s === "available") setStatus("available");
      else if (s === "not-available") setStatus("not-available");
      else if (s === "downloaded") setStatus("downloaded");
      else if (s.startsWith("error:")) setStatus(s as any);
    });
    const off2 = window.baci.updates.onProgress((p) => {
      setStatus("downloading");
      setProgress(p);
    });
    return () => {
      off1?.();
      off2?.();
    };
  }, []);

  const checkAndDownload = async () => {
    setStatus("checking");
    setProgress(null);
    const r = await window.baci.updates.check();
    if (!r.ok) setStatus(`error:${r.error || "unknown"}` as any);
  };

  const quitAndInstall = async () => {
    await window.baci.updates.quitAndInstall();
  };

  return { status, progress, checkAndDownload, quitAndInstall };
}
