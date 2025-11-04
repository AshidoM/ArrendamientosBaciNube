// src/components/Toast.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";

type ToastType = "info" | "success" | "error";
type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
  ttlMs: number;
};

export type ToastOptions = {
  title?: string;
  durationMs?: number; // default 3500
};

/**
 * Hook de toasts no intrusivos.
 * Uso:
 *   const { toastSuccess, toastError, toastInfo, ToastUI } = useToast();
 *   ...
 *   {ToastUI}
 */
export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const remove = useCallback((id: number) => {
    setItems((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string, opts?: ToastOptions) => {
      const id = idRef.current++;
      const ttlMs = Math.max(1000, opts?.durationMs ?? 3500);
      const item: ToastItem = { id, type, message, title: opts?.title, ttlMs };
      setItems((curr) => [...curr, item]);
      // auto-cierre
      window.setTimeout(() => remove(id), ttlMs);
    },
    [remove]
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

  const ToastUI = useMemo(
    () => (
      <div className="toast-root">
        {items.map((t) => (
          <div
            key={t.id}
            className={[
              "toast",
              t.type === "error" ? "toast--error" : "",
              t.type === "success" ? "toast--success" : "",
            ].join(" ")}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {t.title && (
                  <div className="font-semibold text-[12.5px] mb-0.5">
                    {t.title}
                  </div>
                )}
                <div className="text-[13px] break-words">{t.message}</div>
              </div>
              <button
                className="icon-btn"
                aria-label="Cerrar notificación"
                onClick={() => remove(t.id)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    ),
    [items, remove]
  );

  return { toastInfo, toastSuccess, toastError, ToastUI };
}

export default useToast;
