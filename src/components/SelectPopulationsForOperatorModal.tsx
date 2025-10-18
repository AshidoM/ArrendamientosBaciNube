import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { X, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

type Poblacion = {
  id: number;
  folio: string | null;
  nombre: string;
  municipio: string;
  estado_mx: string;
  estado: "ACTIVO" | "INACTIVO";
  operador_id: number | null;
  ruta_id: number | null;
};

export default function SelectPopulationsForOperatorModal({
  operadorId,
  onClose,
}: {
  operadorId: number;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Poblacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [saving, setSaving] = useState(false);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, page]);

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const qq = q.trim();

    let base = supabase
      .from("poblaciones")
      .select("id, folio, nombre, municipio, estado_mx, estado, operador_id, ruta_id", { count: "exact" })
      .order("created_at", { ascending: false });

    if (qq) {
      // Buscar por nombre/municipio/estado_mx
      base = base.or(
        `nombre.ilike.%${qq}%,municipio.ilike.%${qq}%,estado_mx.ilike.%${qq}%`
      );
    } else {
      // Sin búsqueda: sólo listar las asignadas a este operador
      base = base.eq("operador_id", operadorId);
    }

    const { data, error, count } = await base.range(from, to);
    if (!error) {
      setRows((data || []) as any);
      setTotal(count ?? (data?.length ?? 0));
    }
  }

  async function add(p: Poblacion) {
    if (!confirm(`¿Asignar la población "${p.nombre}" a este operador?`)) return;
    setSaving(true);
    try {
      // Asignación simple: operador_id = operadorId
      const { error } = await supabase
        .from("poblaciones")
        .update({ operador_id: operadorId })
        .eq("id", p.id);
      if (error) throw error;
      await load();
    } catch (e) {
      console.error(e);
      alert("No se pudo asignar la población.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Poblacion) {
    if (!confirm(`¿Quitar la población "${p.nombre}" de este operador?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("poblaciones")
        .update({ operador_id: null })
        .eq("id", p.id);
      if (error) throw error;
      await load();
    } catch (e) {
      console.error(e);
      alert("No se pudo quitar la población.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50" onClick={onClose}>
      <div className="w-[96vw] max-w-2xl bg-white rounded-2 border shadow-xl overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Asignar poblaciones al operador</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        {/* Búsqueda */}
        <div className="p-3 grid gap-2">
          <input
            className="input"
            placeholder="Buscar por nombre, municipio o estado…"
            value={q}
            onChange={(e)=>{ setPage(1); setQ(e.target.value); }}
          />
          <div className="text-[12px] text-muted">
            {q.trim() ? "Mostrando resultados de búsqueda." : "Mostrando sólo las poblaciones asignadas a este operador."}
          </div>
        </div>

        {/* Tabla */}
        <div className="border rounded-2 overflow-hidden mx-3">
          <div className="grid grid-cols-12 px-3 py-2 text-[12px] text-muted border-b bg-gray-50">
            <div className="col-span-3">Folio</div>
            <div className="col-span-4">Nombre</div>
            <div className="col-span-3">Municipio / Estado</div>
            <div className="col-span-2 text-right">Acciones</div>
          </div>

          {rows.length === 0 ? (
            <div className="p-3 text-[13px] text-muted">Sin resultados.</div>
          ) : (
            <ul className="divide-y">
              {rows.map(p => (
                <li key={p.id} className="grid grid-cols-12 items-center px-3 py-2">
                  <div className="col-span-3 text-[13px]">{p.folio ?? "—"}</div>
                  <div className="col-span-4 text-[13px]">
                    <div className="truncate">{p.nombre}</div>
                    <div className="text-[12px] text-muted">{p.estado === "ACTIVO" ? "ACTIVO" : "INACTIVO"}</div>
                  </div>
                  <div className="col-span-3 text-[13px]">{p.municipio} / {p.estado_mx}</div>
                  <div className="col-span-2 flex justify-end">
                    {p.operador_id === operadorId ? (
                      <button className="btn-ghost !h-8 !px-3 text-xs text-red-700" onClick={()=>remove(p)} disabled={saving}>
                        <Trash2 className="w-4 h-4" /> Quitar
                      </button>
                    ) : (
                      <button className="btn-primary !h-8 !px-3 text-xs" onClick={()=>add(p)} disabled={saving}>
                        <Plus className="w-4 h-4" /> Añadir
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Paginación */}
        <div className="px-3 py-2 border-t flex items-center justify-between">
          <div className="text-[12px] text-muted">
            {total === 0 ? "0" : `${(page-1)*pageSize + 1}–${Math.min(page*pageSize, total)}`} de {total}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline !h-8 !px-2 text-xs" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="text-[12px] text-muted">Página</div>
            <input className="input !h-8 !w-16 text-center" value={page} onChange={(e)=>setPage(Math.max(1, parseInt(e.target.value||"1")))} />
            <div className="text-[12px] text-muted">de {pages}</div>
            <button className="btn-outline !h-8 !px-2 text-xs" onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page>=pages}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
