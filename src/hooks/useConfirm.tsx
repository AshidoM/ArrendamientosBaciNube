// src/hooks/useConfirm.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

export type ConfirmOpts = {
  title?: string;
  message?: string | JSX.Element;
  confirmText?: string;               // "Confirmar" por defecto
  cancelText?: string;                // "Cancelar" por defecto
  tone?: "default" | "danger" | "warn";
  autoFocus?: "confirm" | "cancel";   // por defecto "confirm"
  disableEsc?: boolean;               // por defecto false
  disableBackdropClose?: boolean;     // por defecto false
};

type Resolver = (v: boolean) => void;

/**
 * Hook de confirmación modal (sin window.confirm).
 * Uso:
 *   const [confirm, ConfirmUI] = useConfirm();
 *   const ok = await confirm({ title: "Eliminar", message: "¿Seguro?", tone: "danger" });
 *   {ConfirmUI}
 */
export function useConfirm(): [(opts: ConfirmOpts) => Promise<boolean>, JSX.Element] {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOpts>({});
  const resolverRef = useRef<Resolver | null>(null);

  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef  = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((result: boolean) => {
    setOpen(false);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  // Manejo de teclado (Esc / Enter)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !opts.disableEsc) {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, opts.disableEsc, close]);

  // Auto-focus en botones
  useEffect(() => {
    if (!open) return;
    const which = opts.autoFocus ?? "confirm";
    const t = window.setTimeout(() => {
      if (which === "confirm") confirmBtnRef.current?.focus();
      else cancelBtnRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, opts.autoFocus]);

  // Evitar scroll del body cuando está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const toneClass =
    opts.tone === "danger" ? "!bg-red-600 hover:!bg-red-700" :
    opts.tone === "warn"   ? "!bg-amber-600 hover:!bg-amber-700" : "";

  const onBackdrop = useCallback(() => {
    if (!opts.disableBackdropClose) close(false);
  }, [opts.disableBackdropClose, close]);

  const stop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const ConfirmUI = useMemo(() => {
    if (!open) return null;
    return (
      <div className="confirm-overlay" onClick={onBackdrop}>
        <div className="confirm-card" role="dialog" aria-modal="true" onClick={stop}>
          <div className="confirm-head">
            <div>{opts.title ?? "Confirmar"}</div>
            <button
              className="btn-ghost !h-8 !px-3 text-xs"
              onClick={() => close(false)}
              aria-label="Cerrar"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="confirm-body">
            {typeof opts.message === "string" ? <p className="text-[13px]">{opts.message}</p> : opts.message}
          </div>

          <div className="confirm-foot">
            <button
              ref={cancelBtnRef}
              className="btn-ghost !h-8 !px-3 text-xs"
              onClick={() => close(false)}
            >
              {opts.cancelText ?? "Cancelar"}
            </button>
            <button
              ref={confirmBtnRef}
              className={["btn-primary !h-8 !px-3 text-xs", toneClass].join(" ")}
              onClick={() => close(true)}
            >
              {opts.confirmText ?? "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    );
  }, [open, opts.title, opts.message, opts.cancelText, opts.confirmText, toneClass, close, onBackdrop, stop]);

  return [confirm, ConfirmUI as JSX.Element];
}

export default useConfirm;
