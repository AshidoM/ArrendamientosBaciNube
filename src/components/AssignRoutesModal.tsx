// src/components/AssignRoutesModal.tsx
import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { assignRouteToCapturista, unassignRouteFromCapturista } from "../lib/assignments";
import useConfirm, { useToast } from "../components/Confirm";

type Ruta = { id: number; folio: string; nombre: string; estado: "ACTIVO" | "INACTIVO" };

export default function AssignRoutesModal({
  capturistaId,
  onClose,
}: {
  capturistaId: string;
  onClose: () => void;
}) {
  const [confirm, ConfirmUI] = useConfirm();
  const [toast, ToastUI] = useToast();

  // búsqueda (no mostrar nada hasta que haya texto)
  const [q, setQ] = useState("");
  const [searchRows, setSearchRows] = useState<Ruta[]>([]);
  const showSearch = q.trim().length >= 2;

  // asignadas (lista paginada a 5)
  const [assigned, setAssigned] = useState<Ruta[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(assigned.length / pageSize));
  const start = (page - 1) * pageSize;
  const end = Math.min(assigned.length, start + pageSize);
  const pageRows = assigned.slice(start, end);

  async function loadAssigned() {
    const { data, error } = await supabase
      .from("capturista_rutas")
      .select("ruta_id, rutas(id, folio, nombre, estado)")
      .eq("capturista_id", capturistaId)
      .eq("activo", true)
      .order("id", { ascending: false });

    if (error) {
      await confirm({
        tone: "danger",
        title: "Error al cargar",
        message: error.message ?? "No se pudieron cargar las rutas asignadas.",
        confirmText: "Entendido",
      });
      return;
    }

    const rows: Ruta[] = (data || []).map((r: any) => r.rutas).filter(Boolean);
    setAssigned(rows);
    setPage(1);
  }

  useEffect(() => {
    loadAssigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // buscar SOLO cuando hay q (2+ chars)
  useEffect(() => {
    let active = true;
    (async () => {
      if (!showSearch) {
        setSearchRows([]);
        return;
      }
      const s = q.trim();
      const { data, error } = await supabase
        .from("rutas")
        .select("id, folio, nombre, estado")
        .or(`folio.ilike.%${s}%,nombre.ilike.%${s}%`)
        .order("id", { ascending: false })
        .limit(20);

      if (error) {
        await confirm({
          tone: "danger",
          title: "Error al buscar",
          message: error.message ?? "No se pudo realizar la búsqueda.",
          confirmText: "Entendido",
        });
        return;
      }

      if (active) setSearchRows((data || []) as Ruta[]);
    })();
    return () => {
      active = false;
    };
  }, [q, showSearch, confirm]);

  async function add(r: Ruta) {
    const ok = await confirm({
      title: "Asignar ruta",
      message: `¿Asignar la ruta ${r.folio} — ${r.nombre}?`,
      confirmText: "Añadir",
    });
    if (!ok) return;

    try {
      await assignRouteToCapturista(capturistaId, r.id);
      toast("Ruta asignada.", "Listo");
      await loadAssigned();
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "No se pudo asignar",
        message: e?.message ?? "Ocurrió un error al asignar la ruta.",
        confirmText: "Entendido",
      });
    }
  }

  async function remove(r: Ruta) {
    const ok = await confirm({
      tone: "warn",
      title: "Quitar ruta",
      message: `¿Quitar la ruta ${r.folio} — ${r.nombre}?`,
      confirmText: "Quitar",
    });
    if (!ok) return;

    try {
      await unassignRouteFromCapturista(capturistaId, r.id);
      toast("Ruta quitada.", "Listo");
      await loadAssigned();
    } catch (e: any) {
      await confirm({
        tone: "danger",
        title: "No se pudo quitar",
        message: e?.message ?? "Ocurrió un error al quitar la ruta.",
        confirmText: "Entendido",
      });
    }
  }

  const assignedIds = useMemo(() => new Set(assigned.map((a) => a.id)), [assigned]);

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50" onClick={onClose}>
      {ConfirmUI}
      {ToastUI}
      <div
        className="w-[96vw] max-w-3xl bg-white rounded-2 border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Asignar rutas</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        <div className="p-3 grid gap-3">
          {/* búsqueda */}
          <div className="relative w-full sm:max-w-sm">
            <input
              className="input"
              placeholder="Buscar ruta… (mín. 2 letras)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* resultados búsqueda (solo si showSearch === true) */}
          <div className="border rounded-2">
            {!showSearch ? (
              <div className="p-3 text-[13px] text-gray-500">Escribe para buscar rutas…</div>
            ) : searchRows.length === 0 ? (
              <div className="p-3 text-[13px] text-gray-500">Sin resultados.</div>
            ) : (
              <ul className="divide-y">
                {searchRows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">
                        {r.folio} — {r.nombre}
                      </div>
                    </div>
                    <button
                      className="btn-primary btn--sm"
                      disabled={assignedIds.has(r.id)}
                      onClick={() => add(r)}
                    >
                      <Plus className="w-4 h-4" /> Añadir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* asignadas (siempre visible) */}
          <div className="border rounded-2">
            {assigned.length === 0 ? (
              <div className="p-3 text-[13px] text-gray-500">Sin rutas asignadas a esta capturista.</div>
            ) : (
              <>
                <ul className="divide-y">
                  {pageRows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-3 py-2">
                      <div className="text-[13px]">
                        {r.folio} — {r.nombre}
                      </div>
                      <button className="btn-outline btn--sm" onClick={() => remove(r)}>
                        <Trash2 className="w-4 h-4" /> Quitar
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="px-3 py-2 border-t flex items-center justify-end gap-2 bg-white">
                  <button
                    className="btn-outline btn--sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <div className="text-[12.5px]">
                    Página {page} de {pages}
                  </div>
                  <button
                    className="btn-outline btn--sm"
                    disabled={page >= pages}
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
