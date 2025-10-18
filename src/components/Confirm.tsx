import { useState } from "react";
import { X } from "lucide-react";

/** Uso:
 * const [confirm, ConfirmUI] = useConfirm();
 * ...
 * const ok = await confirm({ title:"Eliminar", message:"¿Seguro...?", confirmText:"Eliminar", tone:"danger" });
 * if (!ok) return;
 */
type ConfirmOpts = {
  title?: string;
  message?: string | JSX.Element;
  confirmText?: string; // por defecto: "Confirmar"
  cancelText?: string;  // por defecto: "Cancelar"
  tone?: "default" | "danger" | "warn";
};

export function useConfirm(): [
  (opts: ConfirmOpts) => Promise<boolean>,
  JSX.Element
] {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOpts>({});
  const [resolver, setResolver] = useState<(v: boolean) => void>(() => () => {});

  function confirm(o: ConfirmOpts) {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((res) => {
      setResolver(() => res);
    });
  }

  function close(result: boolean) {
    setOpen(false);
    resolver(result);
  }

  const ConfirmUI = !open ? null : (
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
              opts.tone === "warn" ? "!bg-amber-600 hover:!bg-amber-700" : ""
            ].join(" ")}
            onClick={() => close(true)}
          >
            {opts.confirmText ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );

  return [confirm, ConfirmUI];
}

export default useConfirm;
