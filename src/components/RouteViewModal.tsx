// src/components/RouteViewModal.tsx
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type Ruta = {
  id: number;
  folio: string | null;
  nombre: string;
  descripcion: string | null;
  estado: "ACTIVO" | "INACTIVO";
};

type Poblacion = {
  id: number;
  folio: string | null;
  nombre: string;
  municipio: string;
  estado_mx: string;
};

export default function RouteViewModal({
  row,
  onClose,
}: {
  row: Ruta;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"datos" | "pobs">("datos");

  /* TAB Poblaciones */
  const PAGE = 4;
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Poblacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / PAGE)), [total]);

  async function load() {
    let query = supabase
      .from("poblaciones")
      .select("id, folio, nombre, municipio, estado_mx", { count: "exact" })
      .eq("ruta_id", row.id)
      .order("id", { ascending: false });

    const s = q.trim();
    if (s) query = query.or(`nombre.ilike.%${s}%,municipio.ilike.%${s}%,estado_mx.ilike.%${s}%`);

    const { data, error, count } = await query
      .range((page - 1) * PAGE, page * PAGE - 1);

    if (!error) { setRows((data || []) as Poblacion[]); setTotal(count || 0); }
  }

  useEffect(() => { if (tab === "pobs") load(); /* eslint-disable-next-line */ }, [tab, q, page]);

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden">
        {/* Head con pestañas */}
        <div className="h-11 px-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab === "datos" ? "nav-active" : ""}`} onClick={() => setTab("datos")}>
              Datos
            </button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab === "pobs" ? "nav-active" : ""}`} onClick={() => setTab("pobs")}>
              Poblaciones
            </button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {tab === "datos" ? (
          <div className="p-5 grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] px-2 py-1 rounded bg-gray-100 border">{row.folio ?? "—"}</span>
              <span
                className={`text-[12px] px-2 py-1 rounded border ${
                  row.estado === "ACTIVO"
                    ? "bg-blue-50 text-[var(--baci-blue)] border-[var(--baci-blue)]/40"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {row.estado}
              </span>
            </div>

            <div>
              <div className="text-[12px] text-gray-600 mb-1">Nombre</div>
              <div className="text-[13px] font-medium">{row.nombre}</div>
            </div>

            <div>
              <div className="text-[12px] text-gray-600 mb-1">Descripción</div>
              <div className="text-[13px] whitespace-pre-wrap">{row.descripcion || "—"}</div>
            </div>
          </div>
        ) : (
          <div className="p-3 grid gap-3">
            <input
              className="input"
              placeholder="Buscar población en esta ruta…"
              value={q}
              onChange={(e) => { setPage(1); setQ(e.target.value); }}
            />

            <div className="table-frame overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-center">Nombre</th>
                    <th className="text-center">Municipio</th>
                    <th className="text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-[13px] text-muted">
                        Sin poblaciones.
                      </td>
                    </tr>
                  ) : (
                    rows.map(p => (
                      <tr key={p.id}>
                        <td className="text-[13px] text-center">{p.nombre}</td>
                        <td className="text-[13px] text-center">{p.municipio}</td>
                        <td className="text-[13px] text-center">{p.estado_mx}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-1 py-2 flex items-center justify-between">
              <div className="text-[12px] text-muted">
                {total === 0 ? "0" : `${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, total)}`} de {total}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-outline btn--sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <span className="text-[12px]">Página</span>
                <input
                  className="input input--sm !w-16 text-center"
                  value={page}
                  onChange={(e) => {
                    const v = parseInt(e.target.value || "1", 10);
                    if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), pages));
                  }}
                />
                <span className="text-[12px]">de {pages}</span>
                <button className="btn-outline btn--sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}>
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
