// src/components/Confirm.tsx
import { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

/** ============================
 *  Confirmación modal
 *  ============================ */
type ConfirmOpts = {
  title?: string;
  message?: string | JSX.Element;
  confirmText?: string;            // por defecto: "Confirmar"
  cancelText?: string;             // por defecto: "Cancelar"
  tone?: "default" | "danger" | "warn";
};

export function useConfirm(): [
  (opts: ConfirmOpts) => Promise<boolean>,
  JSX.Element
] {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOpts>({});
  const resolverRef = useRef<(v: boolean) => void>();

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((res) => { resolverRef.current = res; });
  }, []);

  const close = useCallback((result: boolean) => {
    setOpen(false);
    resolverRef.current?.(result);
    resolverRef.current = undefined;
  }, []);

  const ConfirmUI = useMemo(()=> !open ? null : (
    <div className="fixed inset-0 z-[10060] grid place-items-center bg-black/50">
      <div className="w-[92vw] max-w-md bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">{opts.title ?? "Confirmar"}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => close(false)}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>
        <div className="p-4 text-[13px]">
          {typeof opts.message === "string" ? <p>{opts.message}</p> : opts.message}
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => close(false)}>
            {opts.cancelText ?? "Cancelar"}
          </button>
          <button
            className={[
              "btn-primary !h-8 !px-3 text-xs",
              opts.tone === "danger" ? "!bg-red-600 hover:!bg-red-700" :
              opts.tone === "warn"   ? "!bg-amber-600 hover:!bg-amber-700" : ""
            ].join(" ")}
            onClick={() => close(true)}
          >
            {opts.confirmText ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  ), [open, opts, close]);

  return [confirm, ConfirmUI as JSX.Element];
}

/** ============================
 *  Toast/Alertas no intrusivas
 *  ============================ */
type Toast = { id: number; title?: string; message: string };
export function useToast(): [(message: string, title?: string) => void, JSX.Element] {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const show = useCallback((message: string, title?: string) => {
    const id = idRef.current++;
    setItems((q) => [...q, { id, title, message }]);
    // auto-cierre
    setTimeout(() => setItems((q) => q.filter((t) => t.id !== id)), 3500);
  }, []);

  const ToastUI = useMemo(() => (
    <div className="fixed top-3 right-3 grid gap-2 z-[10070]">
      {items.map((t) => (
        <div key={t.id} className="card p-3 shadow min-w-[220px] max-w-[360px]">
          {t.title && <div className="text-[12px] font-semibold mb-1">{t.title}</div>}
          <div className="text-[13px]">{t.message}</div>
        </div>
      ))}
    </div>
  ), [items]);

  return [show, ToastUI];
}

export default useConfirm;
