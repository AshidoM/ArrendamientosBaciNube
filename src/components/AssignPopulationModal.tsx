import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import useConfirm from "./Confirm";
import { X, MapPin, Search } from "lucide-react";

type OwnerType = "CLIENTE" | "COORDINADORA";

type Poblacion = {
  id: number;
  folio: string | null;
  nombre: string;
  municipio: string;
  estado_mx: string;
  estado: "ACTIVO" | "INACTIVO";
};

export default function AssignPopulationModal({
  ownerType,
  ownerId,
  onAssigned,
  onClose,
}: {
  ownerType: OwnerType;
  ownerId: number;
  onAssigned?: () => void;
  onClose: () => void;
}) {
  const [confirm, ConfirmUI] = useConfirm();

  // asignación actual
  const [current, setCurrent] = useState<Poblacion | null>(null);

  // búsqueda
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Poblacion[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const end = Math.min(total, start + pageSize);
  const pageRows = rows.slice(start, end);

  async function loadCurrent() {
    const table = ownerType === "CLIENTE" ? "clientes" : "coordinadoras";
    const { data, error } = await supabase
      .from(table)
      .select("poblacion_id, poblaciones:id(folio,nombre,municipio,estado_mx,estado)")
      .eq("id", ownerId)
      .single();

    if (!error && data) {
      const p = (data as any).poblaciones as (Poblacion | null);
      setCurrent(p ? { id: (data as any).poblacion_id, ...p } as any : null);
    }
  }

  async function search() {
    const s = q.trim();
    let query = supabase
      .from("poblaciones")
      .select("id,folio,nombre,municipio,estado_mx,estado")
      .order("created_at", { ascending: false });

    if (s) {
      // nombre | municipio | estado_mx
      query = query.or(
        `folio.ilike.%${s}%,nombre.ilike.%${s}%,municipio.ilike.%${s}%,estado_mx.ilike.%${s}%`
      );
    }
    const { data, error } = await query.limit(200);
    if (!error) setRows((data || []) as any);
  }

  useEffect(() => { loadCurrent(); /* eslint-disable-next-line */ }, [ownerType, ownerId]);
  useEffect(() => { setPage(1); search(); /* eslint-disable-next-line */ }, [q]);

  async function assign(p: Poblacion) {
    const ok = await confirm({
      title: "Asignar población",
      message: <>¿Asignar <strong>{p.folio ?? `P-${p.id}`}</strong> – {p.nombre}, {p.municipio}, {p.estado_mx}?</>,
      confirmText: "Asignar",
      tone: "warn",
    });
    if (!ok) return;

    const table = ownerType === "CLIENTE" ? "clientes" : "coordinadoras";
    const { error } = await supabase.from(table).update({
      poblacion_id: p.id, updated_at: new Date().toISOString(),
    }).eq("id", ownerId);

    if (!error) {
      setCurrent(p);
      onAssigned?.();
    }
  }

  async function clearAssign() {
    if (!current) return;
    const ok = await confirm({
      title: "Quitar asignación",
      message: <>¿Quitar la población <strong>{current.folio ?? `P-${current.id}`}</strong>?</>,
      confirmText: "Quitar",
      tone: "danger",
    });
    if (!ok) return;
    const table = ownerType === "CLIENTE" ? "clientes" : "coordinadoras";
    const { error } = await supabase.from(table).update({
      poblacion_id: null, updated_at: new Date().toISOString(),
    }).eq("id", ownerId);

    if (!error) {
      setCurrent(null);
      onAssigned?.();
    }
  }

  return (
    <div className="fixed inset-0 z-[10060] grid place-items-center bg-black/50" onClick={onClose}>
      <div className="w-[95vw] max-w-2xl bg-white rounded-2 border shadow-xl overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">
            Asignar población – {ownerType === "CLIENTE" ? "Cliente" : "Coordinadora"}
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        {/* actual */}
        <div className="p-3">
          <div className="text-[12px] text-gray-600 mb-1">Asignación actual</div>
          {current ? (
            <div className="flex items-center justify-between border rounded-2 px-3 py-2 text-[13px]">
              <div className="truncate">
                <strong>{current.folio ?? `P-${current.id}`}</strong> — {current.nombre}, {current.municipio}, {current.estado_mx}
              </div>
              <button className="btn-outline !h-8 !px-3 text-xs" onClick={clearAssign}>Quitar</button>
            </div>
          ) : (
            <div className="text-[13px] text-gray-600">Sin población asignada.</div>
          )}
        </div>

        {/* búsqueda */}
        <div className="px-3 pb-3">
          <div className="text-[12px] text-gray-600 mb-1">Buscar población</div>
          <div className="relative">
            <input className="input pl-9" placeholder="Nombre, municipio o estado…" value={q} onChange={(e)=>setQ(e.target.value)} />
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          </div>
        </div>

        {/* resultados */}
        <div className="px-3 pb-3">
          <div className="table-frame">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Nombre</th>
                  <th>Municipio</th>
                  <th>Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-500">
                      {q ? "Sin coincidencias." : "Empieza a escribir para buscar…"}
                    </td>
                  </tr>
                ) : pageRows.map((p) => (
                  <tr key={p.id}>
                    <td className="text-[13px]">{p.folio ?? `P-${p.id}`}</td>
                    <td className="text-[13px]">{p.nombre}</td>
                    <td className="text-[13px]">{p.municipio}</td>
                    <td className="text-[13px]">{p.estado_mx}</td>
                    <td>
                      <div className="flex justify-end">
                        <button className="btn-primary btn--sm" onClick={()=>assign(p)}>
                          <MapPin className="w-3.5 h-3.5" /> Asignar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* paginación 5 por página */}
          <div className="dt__footer">
            <div className="text-[12.5px] text-gray-600">
              {total === 0 ? "0" : `${start + 1}–${end}`} de {total}
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-outline btn--sm" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>{"<"} Anterior</button>
              <div className="text-[12.5px]">Página</div>
              <input className="input input--sm input--pager" value={page} onChange={(e)=>{ const v = parseInt(e.target.value||"1"); if (!Number.isNaN(v)) setPage(Math.min(Math.max(1,v), pages)); }} />
              <div className="text-[12.5px]">de {pages}</div>
              <button className="btn-outline btn--sm" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Siguiente {">"}</button>
            </div>
          </div>
        </div>

        {ConfirmUI}
      </div>
    </div>
  );
}
