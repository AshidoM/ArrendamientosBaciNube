import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { Eye, Wallet, X, Save, Trash2, AlertTriangle, CalendarDays } from "lucide-react";

/** Row del listado (solo ACTIVO) */
type Row = {
  id: number;
  folio: string | null;
  sujeto: "CLIENTE" | "COORDINADORA";
  titular: string;
  semanas: number;
  cuota_semanal: number;
  adeudo_total: number;
};

type Cuota = {
  id: number;
  num_semana: number;
  fecha_programada: string; // yyyy-mm-dd
  monto_programado: number;
  abonado: number;
  estado: "PENDIENTE" | "OMISA" | "VENCIDA" | "PAGADA";
  fecha_pago: string | null;
};

type Pago = {
  id: number;
  fecha_pago: string; // timestamp
  total: number;
  comentario: string | null;
};

export default function Pagos() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [q, setQ] = useState("");

  const [viewFor, setViewFor] = useState<Row | null>(null);
  const [payFor, setPayFor] = useState<Row | null>(null);

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("vw_credito_resumen")
      .select("credito_id, folio, sujeto, titular, semanas, cuota_semanal, adeudo_total, estado", { count: "exact" })
      .eq("estado", "ACTIVO")
      .order("credito_id", { ascending: false });

    const qq = q.trim();
    if (qq) query = query.or(`folio.ilike.%${qq}%,titular.ilike.%${qq}%`);

    const { data, error, count } = await query.range(from, to);
    if (!error) {
      const mapped: Row[] = (data || []).map((r:any)=>({
        id: r.credito_id,
        folio: r.folio,
        sujeto: r.sujeto,
        titular: r.titular,
        semanas: r.semanas,
        cuota_semanal: Number(r.cuota_semanal||0),
        adeudo_total: Number(r.adeudo_total||0),
      }));
      setRows(mapped);
      setTotal(count ?? mapped.length);
    }
  }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ }, [page, pageSize, q]);

  const pages = useMemo(()=>Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return (
    <div className="max-w-[1250px]">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input className="input" placeholder="Buscar por folio o titular…" value={q} onChange={(e)=>{ setPage(1); setQ(e.target.value); }} />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select className="input input--sm" value={pageSize} onChange={(e)=>{ setPage(1); setPageSize(parseInt(e.target.value)); }}>
              {[5,8,10,15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame">
        <table className="min-w-full">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Titular</th>
              <th>Sujeto</th>
              <th>Semanas</th>
              <th>Cuota</th>
              <th>Adeudo</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin resultados.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px]">{r.folio ?? `#${r.id}`}</td>
                <td className="text-[13px]">{r.titular}</td>
                <td className="text-[13px]">{r.sujeto}</td>
                <td className="text-[13px]">{r.semanas}</td>
                <td className="text-[13px]">${r.cuota_semanal.toFixed(2)}</td>
                <td className="text-[13px]">${r.adeudo_total.toFixed(2)}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-outline btn--sm" onClick={()=>setViewFor(r)}><Eye className="w-3.5 h-3.5" /> Ver</button>
                    <button className="btn-primary btn--sm" onClick={()=>setPayFor(r)}><Wallet className="w-3.5 h-3.5" /> Pagar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${(page-1)*pageSize + 1}–${Math.min(page*pageSize, total)}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</button>
          <span className="text-[12.5px]">Página</span>
          <input className="input input--sm input--pager" value={page} onChange={(e)=>setPage(Math.max(1, parseInt(e.target.value||"1")))} />
          <span className="text-[12.5px]">de {pages}</span>
          <button className="btn-outline btn--sm" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Siguiente</button>
        </div>
      </div>

      {viewFor && <VerCreditoMini row={viewFor} onClose={()=>setViewFor(null)} />}
      {payFor && <PagoModal credito={payFor} onClose={()=>{ setPayFor(null); load(); }} />}
    </div>
  );
}

/* ===== Ver simple ===== */
function VerCreditoMini({ row, onClose }: { row: Row; onClose: ()=>void }) {
  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-black/50">
      <div className="w-[92vw] max-w-xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="modal-head">
          <div className="text-[13px] font-medium">Crédito {row.folio ?? `#${row.id}`}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-3 text-[13px]">
          <div><strong>Titular:</strong> {row.titular}</div>
          <div><strong>Sujeto:</strong> {row.sujeto}</div>
          <div><strong>Semanas:</strong> {row.semanas}</div>
          <div><strong>Cuota:</strong> ${row.cuota_semanal.toFixed(2)}</div>
          <div><strong>Adeudo:</strong> ${row.adeudo_total.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

/* ===== Pagar modal (pestañas) ===== */
function PagoModal({ credito, onClose }: { credito: Row; onClose: ()=>void }) {
  const [tab, setTab] = useState<"cuotas"|"pagos">("cuotas");

  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [multaActiva, setMultaActiva] = useState<{id:number, monto:number, fecha:string}|null>(null);

  // registro de pago
  const [importe, setImporte] = useState<number>(0);
  const [comentario, setComentario] = useState("");
  const [fechaPago, setFechaPago] = useState<string>(new Date().toISOString().slice(0,10));

  // M15
  const [fechaM15, setFechaM15] = useState<string>(new Date().toISOString().slice(0,10));
  const cuotaSemanal = credito.cuota_semanal;

  async function load() {
    const [{ data: cuo }, { data: pgs }, { data: multa }] = await Promise.all([
      supabase.from("creditos_cuotas").select("*").eq("credito_id", credito.id).order("num_semana"),
      supabase.from("pagos").select("id,fecha_pago,total,comentario").eq("credito_id", credito.id).order("fecha_pago",{ascending:false}),
      supabase.from("multas").select("id,monto,fecha_creacion,estado").eq("credito_id", credito.id).eq("estado","ACTIVO").maybeSingle(),
    ]);
    setCuotas((cuo||[]) as any);
    setPagos((pgs||[]) as any);
    setMultaActiva(multa ? { id: multa.id, monto: Number(multa.monto), fecha: (multa.fecha_creacion as string).slice(0,10) } : null);
  }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ }, []);

  // Cálculo en tiempo real: cuántas semanas liquida
  const liquida = useMemo(() => {
    let restante = Number(importe || 0);
    if (restante <= 0) return { semanas: 0, parcial: 0 };
    let semanas = 0;
    // recorre cuotas pendientes por orden
    for (const c of cuotas) {
      const pendiente = Math.max(0, Number(c.monto_programado) - Number(c.abonado));
      if (pendiente <= 0) continue;
      if (restante >= pendiente) {
        restante -= pendiente;
        semanas += 1;
      } else {
        // parcial para la siguiente
        break;
      }
    }
    return { semanas, parcial: restante };
  }, [importe, cuotas]);

  async function registrarPago() {
    const monto = Number(importe || 0);
    if (monto <= 0) { alert("Ingresa un importe válido."); return; }

    let restante = monto;
    const updates: Array<{ id:number; abonado:number; estado:string; fecha_pago:string|null }> = [];
    const partidas: Array<{ cuota_id:number; monto:number }> = [];

    for (const c of cuotas) {
      if (restante <= 0) break;
      const pendiente = Math.max(0, Number(c.monto_programado) - Number(c.abonado));
      if (pendiente <= 0) continue;

      const paga = Math.min(restante, pendiente);
      restante -= paga;

      const nuevoAbonado = Number(c.abonado) + paga;
      const pagada = nuevoAbonado + 1e-6 >= Number(c.monto_programado); // tolerancia
      updates.push({
        id: c.id,
        abonado: nuevoAbonado,
        estado: pagada ? "PAGADA" : c.estado, // si no alcanza, no cambia a PAGADA
        fecha_pago: pagada ? fechaPago : c.fecha_pago,
      });
      partidas.push({ cuota_id: c.id, monto: paga });
    }

    // crea pago con el total EXACTO que abonamos (no duplicado)
    const totalReal = partidas.reduce((s, p) => s + p.monto, 0);
    if (totalReal <= 0) { alert("El importe no cubre ninguna cuota."); return; }

    const { data: pagoIns, error: ePago } = await supabase
      .from("pagos").insert({
        credito_id: credito.id,
        capturista_id: null,
        metodo: null,
        referencia: null,
        comentario: comentario || null,
        fecha_pago: new Date(`${fechaPago}T12:00:00`).toISOString(),
        total: totalReal,
      }).select("id").single();
    if (ePago) { console.error(ePago); alert("No se pudo registrar el pago."); return; }

    const pagoId = pagoIns!.id as number;

    // partidas
    await supabase.from("pago_partidas").insert(
      partidas.map(p => ({
        pago_id: pagoId,
        tipo: "CUOTA",
        cuota_id: p.cuota_id,
        multa_id: null,
        monto: p.monto,
      }))
    );

    // aplica updates a cuotas
    for (const u of updates) {
      await supabase.from("creditos_cuotas").update({
        abonado: u.abonado,
        estado: u.estado,
        fecha_pago: u.fecha_pago,
      }).eq("id", u.id);
    }

    await supabase.from("creditos_hist").insert({
      credito_id: credito.id, evento: "PAGO", meta: { total: totalReal }
    });

    setImporte(0);
    setComentario("");
    await load();
    alert("Pago registrado.");
  }

  async function eliminarPago(p: Pago) {
    if (!confirm("¿Eliminar este pago? Se revertirán los abonos asociados.")) return;
    // Para simplificar: borrar pago y el trigger (si lo tienes) debe ajustar; si no, hacemos revert manual:
    const { data: parts } = await supabase
      .from("pago_partidas")
      .select("id, tipo, cuota_id, monto")
      .eq("pago_id", p.id);

    // revertir abonos en cuotas
    for (const it of (parts||[])) {
      if (it.tipo === "CUOTA" && it.cuota_id) {
        const { data: c } = await supabase.from("creditos_cuotas").select("abonado, monto_programado").eq("id", it.cuota_id).maybeSingle();
        if (c) {
          const nuevo = Math.max(0, Number(c.abonado) - Number(it.monto));
          await supabase.from("creditos_cuotas").update({
            abonado: nuevo,
            estado: nuevo + 1e-6 >= Number(c.monto_programado) ? "PAGADA" : "PENDIENTE",
            // si ya no está pagada, quitamos fecha pago
            fecha_pago: (nuevo + 1e-6 >= Number(c.monto_programado)) ? new Date().toISOString().slice(0,10) : null
          }).eq("id", it.cuota_id);
        }
      }
    }

    await supabase.from("pago_partidas").delete().eq("pago_id", p.id);
    await supabase.from("pagos").delete().eq("id", p.id);
    await supabase.from("creditos_hist").insert({
      credito_id: credito.id, evento: "PAGO_ELIMINADO", meta: { pago_id: p.id }
    });
    await load();
  }

  // M15
  async function aplicarM15() {
    if (multaActiva) { alert("Ya hay una M15 activa."); return; }
    const when = new Date(`${fechaM15}T12:00:00`).toISOString();
    const monto = cuotaSemanal; // equivalente a una cuota
    const { error } = await supabase.from("multas").insert({
      credito_id: credito.id,
      cuota_id: null,
      tipo: "M15",
      estado: "ACTIVO",
      monto,
      monto_pagado: 0,
      fecha_creacion: when,
      fecha_pago: null
    });
    if (error) { console.error(error); alert("No se pudo aplicar M15."); return; }
    await supabase.from("creditos_hist").insert({
      credito_id: credito.id, evento: "M15_APLICADA", meta: { fecha: fechaM15, monto }
    });
    await load();
  }

  async function quitarM15() {
    if (!multaActiva) return;
    if (!confirm("¿Quitar M15 activa?")) return;
    await supabase.from("multas").update({ estado: "INACTIVO", fecha_pago: new Date().toISOString() }).eq("id", multaActiva.id);
    await supabase.from("creditos_hist").insert({
      credito_id: credito.id, evento: "M15_QUITADA", meta: { multa_id: multaActiva.id }
    });
    await load();
  }

  return (
    <div className="fixed inset-0 z-[10030] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-4xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-medium">Pagar – {credito.folio ?? `#${credito.id}`} – {credito.titular}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 p-3 border-b">
          <div className="sm:col-span-1">
            <div className="text-[12px] text-muted mb-1">Importe a registrar</div>
            <input className="input" type="number" step="0.01" value={importe} onChange={(e)=>setImporte(parseFloat(e.target.value||"0"))} />
            <div className="text-[12px] text-muted mt-1">
              Liquida <strong>{liquida.semanas}</strong> semana(s){liquida.parcial>0?` y $${liquida.parcial.toFixed(2)} parcial`:''}
            </div>
          </div>
          <div className="sm:col-span-1">
            <div className="text-[12px] text-muted mb-1">Fecha de pago</div>
            <div className="relative">
              <CalendarDays className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input className="input pl-8" type="date" value={fechaPago} onChange={(e)=>setFechaPago(e.target.value)} />
            </div>
          </div>
          <div className="sm:col-span-1">
            <div className="text-[12px] text-muted mb-1">Comentario</div>
            <input className="input" value={comentario} onChange={(e)=>setComentario(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <div className="px-3 py-2 border-b flex items-center gap-2">
          <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="cuotas"?"nav-active":""}`} onClick={()=>setTab("cuotas")}>Cuotas programadas</button>
          <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="pagos"?"nav-active":""}`} onClick={()=>setTab("pagos")}>Pagos realizados</button>
          <div className="ml-auto flex items-center gap-2">
            {!multaActiva ? (
              <>
                <div className="text-[12px] text-muted">Aplicar M15</div>
                <input className="input input--sm" type="date" value={fechaM15} onChange={(e)=>setFechaM15(e.target.value)} />
                <button className="btn-outline !h-8 !px-3 text-xs" onClick={aplicarM15}>Aplicar</button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-[12px] text-muted">
                  M15 activa: <strong>${multaActiva.monto.toFixed(2)}</strong> ({multaActiva.fecha})
                </div>
                <button className="btn-ghost !h-8 !px-3 text-xs text-red-700" onClick={quitarM15}>
                  <Trash2 className="w-4 h-4" /> Quitar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Contenido con scroll */}
        {tab==="cuotas" ? (
          <div className="p-3" style={{ maxHeight: "50vh", overflow: "auto" }}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Abonado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cuotas.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin cuotas.</td></tr>
                ) : cuotas.map(c => (
                  <tr key={c.id}>
                    <td className="text-[13px]">{c.num_semana}</td>
                    <td className="text-[13px]">{c.fecha_programada}</td>
                    <td className="text-[13px]">${Number(c.monto_programado).toFixed(2)}</td>
                    <td className="text-[13px]">${Number(c.abonado).toFixed(2)}</td>
                    <td className="text-[13px]">
                      {c.estado === "PAGADA" ? "PAGADA" :
                       c.estado === "VENCIDA" ? "VENCIDA" :
                       c.estado === "OMISA" ? "OMISA" : "PENDIENTE"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-3" style={{ maxHeight: "50vh", overflow: "auto" }}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Comentario</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagos.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin pagos.</td></tr>
                ) : pagos.map(p => (
                  <tr key={p.id}>
                    <td className="text-[13px]">{p.fecha_pago.slice(0,10)}</td>
                    <td className="text-[13px]">${Number(p.total).toFixed(2)}</td>
                    <td className="text-[13px]">{p.comentario ?? "—"}</td>
                    <td className="text-right">
                      <button className="btn-ghost !h-8 !px-3 text-xs text-red-700" onClick={()=>eliminarPago(p)}>
                        <Trash2 className="w-4 h-4" /> Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-3 py-3 border-t flex justify-end gap-2">
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cerrar</button>
          <button className="btn-primary !h-8 !px-3 text-xs" onClick={registrarPago} disabled={importe<=0}>
            <Save className="w-4 h-4" /> Registrar pago
          </button>
        </div>
      </div>
    </div>
  );
}
