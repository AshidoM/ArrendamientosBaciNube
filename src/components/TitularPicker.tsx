import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTitulares, type TitularLite } from "../services/titulares.service";

type Props = {
  supabase: SupabaseClient;
  sujeto: "CLIENTE" | "COORDINADORA";
  onPicked: (t: TitularLite) => void;
  onClear?: () => void;
};

export default function TitularPicker({ supabase, sujeto, onPicked, onClear }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TitularLite[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cierra al hacer click fuera
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // Búsqueda con debounce
  useEffect(() => {
    const qTrim = q.trim();
    if (qTrim.length < 2) { setItems([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await buscarTitulares(supabase, sujeto, qTrim, 8);
        setItems(res);
        setOpen(true);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, sujeto, supabase]);

  function pick(t: TitularLite) {
    onPicked(t);
    setOpen(false);
    setQ(t.nombre); // muestra elegido
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        className="input dt__search--sm"
        placeholder={`Buscar ${sujeto === "CLIENTE" ? "cliente" : "coordinadora"}…`}
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          if (!v && onClear) onClear();
        }}
        onFocus={() => { if (items.length > 0) setOpen(true); }}
      />

      {open && (
        <div className="absolute mt-1 w-full z-[1000] bg-white border rounded-2 shadow-xl max-h-64 overflow-auto">
          {loading ? (
            <div className="p-2 text-[12.5px] text-muted">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="p-2 text-[12.5px] text-muted">Sin resultados</div>
          ) : (
            <ul className="divide-y">
              {items.map((t) => (
                <li key={t.id}>
                  <button
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50"
                    onClick={() => pick(t)}
                  >
                    <div className="font-medium">{t.nombre}</div>
                    <div className="text-[12px] text-muted">{t.folio ?? ""}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
