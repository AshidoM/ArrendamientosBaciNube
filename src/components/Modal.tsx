import { PropsWithChildren } from "react";
import { X } from "lucide-react";

type ModalProps = PropsWithChildren<{
  title: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: React.ReactNode;
}>;

export default function Modal({ title, onClose, size="md", footer, children }: ModalProps) {
  const maxW = size === "sm" ? "max-w-md"
            : size === "md" ? "max-w-xl"
            : size === "lg" ? "max-w-3xl"
            : "max-w-5xl";

  return (
    <div className="fixed inset-0 z-[10060] grid place-items-center bg-black/50">
      <div className={`w-[96vw] ${maxW} bg-white rounded-2 border shadow-xl overflow-hidden`}>
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">{title}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        <div className="p-3">{children}</div>

        {footer && (
          <div className="px-3 py-2 border-t bg-white flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
