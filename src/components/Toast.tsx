import React, { useCallback, useMemo, useRef, useState } from "react";

type ToastType = "info" | "success" | "error";

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
  ttlMs: number;
  leaving?: boolean;
};

export type ToastOptions = {
  title?: string;
  durationMs?: number; // default 3500
};

type TimerRef = {
  startedAt: number;
  remaining: number;
  handle?: number;
};

export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  // timers por toast para pausar en hover
  const timers = useRef<Map<number, TimerRef>>(new Map());

  const reallyRemove = useCallback((id: number) => {
    setItems((curr) => curr.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t?.handle) window.clearTimeout(t.handle);
    timers.current.delete(id);
  }, []);

  const markLeaving = useCallback((id: number) => {
    setItems((curr) => curr.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    // espera a la animación de salida (150ms) y elimina
    window.setTimeout(() => reallyRemove(id), 160);
  }, [reallyRemove]);

  const armTimer = useCallback((toast: ToastItem) => {
    const existing = timers.current.get(toast.id);
    const baseRemaining = existing?.remaining ?? toast.ttlMs;
    const startedAt = Date.now();
    const handle = window.setTimeout(() => markLeaving(toast.id), baseRemaining);
    timers.current.set(toast.id, { startedAt, remaining: baseRemaining, handle });
  }, [markLeaving]);

  const push = useCallback(
    (type: ToastType, message: string, opts?: ToastOptions) => {
      const id = idRef.current++;
      const ttlMs = Math.max(1000, opts?.durationMs ?? 3500);
      const toast: ToastItem = { id, type, message, title: opts?.title, ttlMs };
      setItems((curr) => [...curr, toast]);
      // arma timer asíncrono para asegurar que el DOM lo pinte primero
      queueMicrotask(() => armTimer(toast));
    },
    [armTimer]
  );

  const toastInfo = useCallback(
    (message: string, title?: string, durationMs?: number) =>
      push("info", message, { title, durationMs }),
    [push]
  );
  const toastSuccess = useCallback(
    (message: string, title?: string, durationMs?: number) =>
      push("success", message, { title, durationMs }),
    [push]
  );
  const toastError = useCallback(
    (message: string, title?: string, durationMs?: number) =>
      push("error", message, { title, durationMs }),
    [push]
  );

  const onMouseEnter = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t) return;
    if (t.handle) window.clearTimeout(t.handle);
    const elapsed = Date.now() - t.startedAt;
    t.remaining = Math.max(0, t.remaining - elapsed);
    t.handle = undefined;
  }, []);

  const onMouseLeave = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t) return;
    const startedAt = Date.now();
    const handle = window.setTimeout(() => markLeaving(id), t.remaining);
    t.startedAt = startedAt;
    t.handle = handle;
  }, [markLeaving]);

  const ToastUI = useMemo(
    () => (
      <div className="toastv2-root" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div
            key={t.id}
            className={[
              "toastv2",
              `toastv2--${t.type}`,
              t.leaving ? "toastv2--leaving" : "toastv2--enter",
            ].join(" ")}
            role="status"
            onMouseEnter={() => onMouseEnter(t.id)}
            onMouseLeave={() => onMouseLeave(t.id)}
          >
            <span className="toastv2__bar" aria-hidden="true" />
            <div className="toastv2__body">
              {t.title ? (
                <div className="toastv2__line">
                  <strong className="toastv2__title">{t.title}</strong>
                  <span className="toastv2__msg">{t.message}</span>
                </div>
              ) : (
                <div className="toastv2__line">
                  <span className="toastv2__msg">{t.message}</span>
                </div>
              )}
            </div>
            <button
              className="toastv2__close"
              aria-label="Cerrar notificación"
              onClick={() => markLeaving(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    ),
    [items, onMouseEnter, onMouseLeave, markLeaving]
  );

  return { toastInfo, toastSuccess, toastError, ToastUI };
}

export default useToast;
