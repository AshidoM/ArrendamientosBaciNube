// src/components/AssignPopulationsToRouteModal.tsx
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CheckSquare, Square, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/Confirm";

type Ruta = {
  id: number;
  nombre: string;
};

type Poblacion = {
  id: number;
  folio: string | null;
  nombre: string;
  municipio: string;
  estado_mx: string;
  ruta_id: number | null;
  coordinadora_id?: number | null;
};

export default function AssignPopulationsToRouteModal({
  ruta,
  onClose,
  onChanged,
}: {
  ruta: Ruta;
  onClose: () => void;
  /** Llamado cuando se añaden o quitan poblaciones, para refrescar la tabla padre */
  onChanged?: () => void;
}) {
  const [confirm, ConfirmUI] = useConfirm();
  const [tab, setTab] = useState<"buscar" | "asignadas">("buscar");

  /* =========================
     TAB: Buscar
  ========================= */
  const PAGE_SEARCH = 4;

  const [q, setQ] = useState("");
  const [resRows, setResRows] = useState<Poblacion[]>([]);
  const [resTotal, setResTotal] = useState(0);
  const [resPage, setResPage] = useState(1);
  const resPages = useMemo(
    () => Math.max(1, Math.ceil(resTotal / PAGE_SEARCH)),
    [resTotal]
  );

  const [picked, setPicked] = useState<Poblacion[]>([]);
  const pickedIds = useMemo(() => new Set(picked.map(p => p.id)), [picked]);

  function togglePick(p: Poblacion) {
    // No permitir seleccionar si YA está en esta ruta
    if (p.ruta_id === ruta.id) return;

    setPicked(list => {
      const exists = list.some(x => x.id === p.id);
      return exists ? list.filter(x => x.id !== p.id) : [...list, p];
    });
  }

  function statusLabel(p: Poblacion) {
    if (p.ruta_id === ruta.id) return "En esta ruta";
    if (p.ruta_id && p.ruta_id !== ruta.id) return "En otra ruta";
    if (pickedIds.has(p.id)) return "Seleccionada";
    return "Libre";
  }

  async function loadResultados() {
    const qq = q.trim();
    if (!qq) {
      setResRows([]);
      setResTotal(0);
      return;
    }

    const { data, error, count } = await supabase
      .from("poblaciones")
      .select("id, folio, nombre, municipio, estado_mx, ruta_id, coordinadora_id", { count: "exact" })
      .or(`nombre.ilike.%${qq}%,municipio.ilike.%${qq}%,estado_mx.ilike.%${qq}%`)
      .order("id", { ascending: false })
      .range((resPage - 1) * PAGE_SEARCH, resPage * PAGE_SEARCH - 1);

    if (error) return alert(error.message);
    setResRows((data || []) as Poblacion[]);
    setResTotal(count || 0);
  }

  useEffect(() => { setResPage(1); }, [q]);
  useEffect(() => { if (tab === "buscar") loadResultados(); /* eslint-disable-next-line */ }, [tab, q, resPage]);

  async function applyPicked() {
    const ids = picked.filter(p => p.ruta_id !== ruta.id).map(p => p.id);
    if (!ids.length) return;
    const ok = await confirm({
      title: "Añadir seleccionadas",
      message: <>¿Asignar <b>{ids.length}</b> poblaciones a la ruta <b>{ruta.nombre}</b>?</>,
      confirmText: "Añadir",
    });
    if (!ok) return;

    const { error } = await supabase.from("poblaciones").update({ ruta_id: ruta.id }).in("id", ids);
    if (error) return alert(error.message);

    setPicked([]);
    await loadResultados();
    await loadAsignadas();
    setTab("asignadas");
    onChanged?.();
  }

  /* =========================
     TAB: Asignadas
  ========================= */
  const PAGE_ASIG = 4;

  const [asigRows, setAsigRows] = useState<Poblacion[]>([]);
  const [asigTotal, setAsigTotal] = useState(0);
  const [asigPage, setAsigPage] = useState(1);
  const asigPages = useMemo(
    () => Math.max(1, Math.ceil(asigTotal / PAGE_ASIG)),
    [asigTotal]
  );

  async function loadAsignadas() {
    const { data, error, count } = await supabase
      .from("poblaciones")
      .select("id, folio, nombre, municipio, estado_mx, ruta_id", { count: "exact" })
      .eq("ruta_id", ruta.id)
      .order("id", { ascending: false })
      .range((asigPage - 1) * PAGE_ASIG, asigPage * PAGE_ASIG - 1);

    if (error) return alert(error.message);
    setAsigRows((data || []) as Poblacion[]);
    setAsigTotal(count || 0);
  }

  useEffect(() => { if (tab === "asignadas") loadAsignadas(); /* eslint-disable-next-line */ }, [tab, asigPage]);

  async function remove(p: Poblacion) {
    const ok = await confirm({
      title: "Quitar población",
      message: <>¿Quitar <b>{p.nombre}</b> de la ruta <b>{ruta.nombre}</b>?</>,
      confirmText: "Quitar",
      tone: "warn",
    });
    if (!ok) return;

    const { error } = await supabase.from("poblaciones").update({ ruta_id: null }).eq("id", p.id);
    if (error) return alert(error.message);

    await loadAsignadas();
    onChanged?.();
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      {ConfirmUI}
      <div className="w-[96vw] max-w-5xl bg-white rounded-2 border shadow-xl overflow-hidden">
        {/* Head con pestañas */}
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className={`btn-ghost !h-8 !px-3 text-xs ${tab === "buscar" ? "nav-active" : ""}`}
              onClick={() => setTab("buscar")}
            >
              Seleccionar
            </button>
            <button
              className={`btn-ghost !h-8 !px-3 text-xs ${tab === "asignadas" ? "nav-active" : ""}`}
              onClick={() => setTab("asignadas")}
            >
              Asignadas
            </button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {/* Contenido */}
        <div className="p-3">
          {tab === "buscar" ? (
            <div className="grid gap-3">
              {/* Barra seleccionadas */}
              <div className="p-2 border rounded-2 bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px]">
                    Seleccionadas: <b>{picked.length}</b>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-outline btn--sm"
                      onClick={() => setPicked([])}
                      disabled={picked.length === 0}
                    >
                      Limpiar
                    </button>
                    <button
                      className="btn-primary btn--sm"
                      onClick={applyPicked}
                      disabled={picked.length === 0}
                    >
                      Añadir seleccionadas
                    </button>
                  </div>
                </div>

                {picked.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {picked.map(p => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-2 text-[12px] px-2 py-1 rounded-full border bg-white"
                      >
                        {p.nombre}
                        <button className="text-red-600" onClick={() => togglePick(p)} title="Quitar">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Buscar */}
              <input
                className="input"
                placeholder="Buscar por Nombre / Municipio / Estado…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              {/* Resultados centrados */}
              {q.trim() === "" ? (
                <div className="p-4 text-[13px] text-muted">Escribe para buscar poblaciones.</div>
              ) : resRows.length === 0 ? (
                <div className="p-4 text-[13px] text-muted">Sin resultados para “{q}”.</div>
              ) : (
                <div className="table-frame overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-center"></th>
                        <th className="text-center">Nombre</th>
                        <th className="text-center">Municipio</th>
                        <th className="text-center">Estado</th>
                        <th className="text-center">Situación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resRows.map(p => {
                        const isSelected = pickedIds.has(p.id);
                        const inThisRoute = p.ruta_id === ruta.id;
                        const disabled = inThisRoute; // <<— NO permitir seleccionar si ya está en esta ruta
                        return (
                          <tr key={p.id}>
                            <td className="text-center">
                              <button
                                className="btn-ghost !h-7 !px-2 disabled:opacity-50"
                                onClick={() => togglePick(p)}
                                disabled={disabled}
                                title={
                                  inThisRoute
                                    ? "Ya pertenece a esta ruta"
                                    : isSelected
                                    ? "Quitar de seleccionadas"
                                    : "Seleccionar"
                                }
                              >
                                {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                              </button>
                            </td>
                            <td className="text-[13px] text-center">{p.nombre}</td>
                            <td className="text-[13px] text-center">{p.municipio}</td>
                            <td className="text-[13px] text-center">{p.estado_mx}</td>
                            <td className="text-[12px] text-center">{statusLabel(p)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Paginación resultados */}
              <div className="px-1 py-2 flex items-center justify-between">
                <div className="text-[12px] text-muted">
                  {resTotal === 0 ? "0" : `${(resPage - 1) * PAGE_SEARCH + 1}–${Math.min(resPage * PAGE_SEARCH, resTotal)}`} de {resTotal}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-outline btn--sm"
                    onClick={() => setResPage(p => Math.max(1, p - 1))}
                    disabled={resPage <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-[12px]">Página</span>
                  <input
                    className="input input--sm !w-16 text-center"
                    value={resPage}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || "1", 10);
                      if (!Number.isNaN(v)) setResPage(Math.min(Math.max(1, v), resPages));
                    }}
                  />
                  <span className="text-[12px]">de {resPages}</span>
                  <button
                    className="btn-outline btn--sm"
                    onClick={() => setResPage(p => Math.min(resPages, p + 1))}
                    disabled={resPage >= resPages}
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ===== TAB Asignadas ===== */
            <div className="grid gap-3">
              <div className="table-frame overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-center">Nombre</th>
                      <th className="text-center">Municipio</th>
                      <th className="text-center">Estado</th>
                      <th className="th--actions-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asigRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-[13px] text-muted">
                          Sin poblaciones asignadas.
                        </td>
                      </tr>
                    ) : (
                      asigRows.map(p => (
                        <tr key={p.id}>
                          <td className="text-[13px] text-center">{p.nombre}</td>
                          <td className="text-[13px] text-center">{p.municipio}</td>
                          <td className="text-[13px] text-center">{p.estado_mx}</td>
                          <td className="td--actions-center">
                            <div className="inline-flex items-center">
                              <button className="btn-outline btn--sm" onClick={() => remove(p)}>
                                Quitar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación asignadas */}
              <div className="px-1 py-2 flex items-center justify-between">
                <div className="text-[12px] text-muted">
                  {asigTotal === 0 ? "0" : `${(asigPage - 1) * PAGE_ASIG + 1}–${Math.min(asigPage * PAGE_ASIG, asigTotal)}`} de {asigTotal}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-outline btn--sm"
                    onClick={() => setAsigPage(p => Math.max(1, p - 1))}
                    disabled={asigPage <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-[12px]">Página</span>
                  <input
                    className="input input--sm !w-16 text-center"
                    value={asigPage}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || "1", 10);
                      if (!Number.isNaN(v)) setAsigPage(Math.min(Math.max(1, v), asigPages));
                    }}
                  />
                  <span className="text-[12px]">de {asigPages}</span>
                  <button
                    className="btn-outline btn--sm"
                    onClick={() => setAsigPage(p => Math.min(asigPages, p + 1))}
                    disabled={asigPage >= asigPages}
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
