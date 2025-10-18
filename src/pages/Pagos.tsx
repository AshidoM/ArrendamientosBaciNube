// src/pages/Pagos.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import {
  Search, Plus, X, Save, Trash2, Pencil, AlertTriangle, CheckCircle, CalendarDays, ShieldAlert
} from "lucide-react";

/* ===== Tipos mínimos ===== */
type CreditoLite = {
  id: number;
  folio: string | null;
  sujeto: "CLIENTE" | "COORDINADORA";
  titular: string;
  cuota_semanal: number;
  semanas: number;
};

type Cuota = {
  id: number;
  credito_id: number;
  num_semana: number;
  fecha_programada: string; // ISO
  monto_programado: number;
  abonado: number;
  estado: "PENDIENTE" | "OMISA" | "VENCIDA" | "PAGADA";
  fecha_pago: string | null;
};

type Pago = {
  id: number;
  credito_id: number;
  fecha_pago: string; // tsz
  total: number;
  metodo: string | null;
  referencia: string | null;
  comentario: string | null;
};

type Partida = {
  id: number;
  pago_id: number;
  tipo: "CUOTA" | "MULTA";
  cuota_id: number | null;
  multa_id: number | null;
  monto: number;
};

type Multa = {
  id: number;
  credito_id: number;
  tipo: "M15" | string;
  estado: "ACTIVO" | "INACTIVO";
  monto: number;
  monto_pagado: number;
  fecha_creacion: string;
  fecha_pago: string | null;
};

export default function Pagos() {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CreditoLite[]>([]);
  const [sel, setSel] = useState<CreditoLite | null>(null);

  // data del crédito
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [partidasByPago, setPartidasByPago] = useState<Record<number, Partida[]>>({});
  const [multa, setMulta] = useState<Multa | null>(null);

  // modales
  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState<{ open: boolean; pago?: Pago }>(
    { open: false }
  );

  /* ===== Búsqueda en tiempo real de créditos (vista resumen) ===== */
  useEffect(() => {
    const run = async () => {
      const term = q.trim();
      if (!term) { setResultados([]); return; }
      const { data, error } = await supabase
        .from("vw_credito_resumen")
        .select("credito_id, folio, sujeto, titular, cuota_semanal, semanas")
        .or(`folio.ilike.%${term}%,titular.ilike.%${term}%`)
        .limit(8);
      if (!error) {
        setResultados((data || []).map((r: any) => ({
          id: r.credito_id,
          folio: r.folio,
          sujeto: r.sujeto,
          titular: r.titular,
          cuota_semanal: Number(r.cuota_semanal),
          semanas: Number(r.semanas),
        })));
      }
    };
    run();
  }, [q]);

  /* ===== Carga de datos del crédito seleccionado ===== */
  async function loadCreditoData(creditoId: number) {
    const [c1, p1, pa1, m1] = await Promise.all([
      supabase.from("creditos_cuotas")
        .select("*")
        .eq("credito_id", creditoId)
        .order("num_semana", { ascending: true }),
      supabase.from("pagos")
        .select("*")
        .eq("credito_id", creditoId)
        .order("fecha_pago", { ascending: true }),
      supabase.from("pago_partidas")
        .select("*")
        .in("pago_id", (await supabase.from("pagos").select("id").eq("credito_id", creditoId)).data?.map((x:any)=>x.id) || [])
        .order("id", { ascending: true }),
      supabase.from("multas")
        .select("*")
        .eq("credito_id", creditoId)
        .eq("estado", "ACTIVO")
        .maybeSingle(),
    ]);
    if (!c1.error) setCuotas(c1.data as any);
    if (!p1.error) setPagos(p1.data as any);
    if (!pa1.error) {
      const map: Record<number, Partida[]> = {};
      (pa1.data || []).forEach((p: any) => {
        const arr = map[p.pago_id] || (map[p.pago_id] = []);
        arr.push(p);
      });
      setPartidasByPago(map);
    }
    if (!m1.error) setMulta(m1.data as any);
  }

  /* ===== Selección de crédito ===== */
  function selectCredito(item: CreditoLite) {
    setSel(item);
    setResultados([]);
    setQ(`${item.folio ?? "CR-?"} - ${item.titular}`);
    loadCreditoData(item.id);
  }

  /* ===== Helpers ===== */
  const cuotasPendientes = useMemo(
    () => cuotas.filter(c => c.abonado < c.monto_programado).sort((a,b)=>a.num_semana-b.num_semana),
    [cuotas]
  );

  /* ===== Crear pago (y Editar como reaplicar) ===== */
  async function allocateAndSavePayment(credito: CreditoLite, amount: number, aplicarM15: boolean, reusePagoId?: number) {
    // Si reusePagoId se pasa, "editar": limpia partidas del pago y reaplica con el nuevo total.
    // Si no, crea un pago nuevo.

    if (amount <= 0) throw new Error("Importe inválido.");

    // 1) Si editar: limpiar partidas previas y revertir efectos
    if (reusePagoId) {
      // revertir cuotas/multa
      const { data: parts } = await supabase.from("pago_partidas").select("*").eq("pago_id", reusePagoId);
      for (const part of (parts || [])) {
        if (part.tipo === "CUOTA" && part.cuota_id) {
          const { data: c } = await supabase.from("creditos_cuotas").select("abonado,monto_programado").eq("id", part.cuota_id).maybeSingle();
          if (c) {
            const nuevo = Math.max(0, Number(c.abonado) - Number(part.monto));
            const pagada = nuevo >= Number(c.monto_programado);
            await supabase.from("creditos_cuotas").update({
              abonado: nuevo,
              estado: pagada ? "PAGADA" : "PENDIENTE",
              fecha_pago: pagada ? new Date().toISOString().slice(0,10) : null
            }).eq("id", part.cuota_id);
          }
        } else if (part.tipo === "MULTA" && part.multa_id) {
          const { data: m } = await supabase.from("multas").select("monto_pagado").eq("id", part.multa_id).maybeSingle();
          if (m) {
            const nuevo = Math.max(0, Number(m.monto_pagado) - Number(part.monto));
            await supabase.from("multas").update({
              monto_pagado: nuevo,
              estado: "ACTIVO",
              fecha_pago: null
            }).eq("id", part.multa_id);
          }
        }
      }
      await supabase.from("pago_partidas").delete().eq("pago_id", reusePagoId);
      await supabase.from("pagos").update({ total: amount }).eq("id", reusePagoId);
    }

    // 2) Si nuevo: crear pago
    let pagoId = reusePagoId;
    if (!pagoId) {
      const { data: pnew, error: eP } = await supabase.from("pagos").insert({
        credito_id: credito.id,
        total: amount,
        fecha_pago: new Date().toISOString(),
      }).select("id").single();
      if (eP) throw eP;
      pagoId = pnew!.id as number;
    }

    let restante = amount;

    // 3) Asignar a cuotas en orden
    // refrescar cuotas por si hubo cambios
    const { data: cuotasNow } = await supabase
      .from("creditos_cuotas")
      .select("*")
      .eq("credito_id", credito.id)
      .order("num_semana", { ascending: true });

    for (const c of (cuotasNow || []).filter((x:any)=>Number(x.abonado) < Number(x.monto_programado))) {
      if (restante <= 0) break;
      const falta = Number(c.monto_programado) - Number(c.abonado);
      const apli = Math.min(restante, falta);

      // partida
      await supabase.from("pago_partidas").insert({
        pago_id: pagoId,
        tipo: "CUOTA",
        cuota_id: c.id,
        multa_id: null,
        monto: apli
      });

      // actualizar cuota
      const nuevo = Number(c.abonado) + apli;
      const pagada = nuevo >= Number(c.monto_programado);
      await supabase.from("creditos_cuotas").update({
        abonado: nuevo,
        estado: pagada ? "PAGADA" : c.estado,
        fecha_pago: pagada ? new Date().toISOString().slice(0,10) : c.fecha_pago
      }).eq("id", c.id);

      restante -= apli;
    }

    // 4) Si se indicó aplicar a M15 y existe activa
    if (restante > 0 && aplicarM15) {
      const { data: m } = await supabase
        .from("multas")
        .select("*")
        .eq("credito_id", credito.id)
        .eq("estado", "ACTIVO")
        .maybeSingle();

      if (m) {
        const pendiente = Number(m.monto) - Number(m.monto_pagado);
        const apliM = Math.min(restante, pendiente);

        if (apliM > 0) {
          await supabase.from("pago_partidas").insert({
            pago_id: pagoId,
            tipo: "MULTA",
            cuota_id: null,
            multa_id: m.id,
            monto: apliM
          });

          const nuevoPagado = Number(m.monto_pagado) + apliM;
          const saldado = nuevoPagado >= Number(m.monto);
          await supabase.from("multas").update({
            monto_pagado: nuevoPagado,
            estado: saldado ? "INACTIVO" : "ACTIVO",
            fecha_pago: saldado ? new Date().toISOString() : null
          }).eq("id", m.id);

          restante -= apliM;
        }
      }
    }

    // 5) done → refrescar
    await loadCreditoData(credito.id);
  }

  /* ===== Registrar pago modal ===== */
  function NewPaymentModal({ onClose }: { onClose: () => void }) {
    const [monto, setMonto] = useState<number>(0);
    const [aplicarM15, setAplicarM15] = useState(false);

    const liquidaSemanas = useMemo(() => {
      if (!sel || monto <= 0) return 0;
      // simulación simple sobre las cuotas pendientes:
      let restante = monto;
      let count = 0;
      for (const c of cuotasPendientes) {
        const falta = Number(c.monto_programado) - Number(c.abonado);
        if (restante >= falta) { restante -= falta; count++; } else break;
      }
      return count;
    }, [monto, cuotasPendientes, sel]);

    return (
      <div className="fixed inset-0 z-[10030] grid place-items-center bg-black/50">
        <div className="w-[92vw] max-w-md bg-white rounded-2 border shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-[13px] font-medium">Registrar pago</div>
            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
          </div>
          <div className="p-4 grid gap-3">
            <div className="text-[12px] text-muted">
              Crédito: <strong>{sel?.folio ?? `#${sel?.id}`}</strong> — {sel?.titular} — cuota ${sel?.cuota_semanal.toFixed(2)}
            </div>
            <label className="block">
              <div className="text-[12px] text-gray-600 mb-1">Importe</div>
              <input className="input" type="number" step="0.01" value={monto} onChange={(e)=>setMonto(parseFloat(e.target.value || "0"))} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={aplicarM15} onChange={(e)=>setAplicarM15(e.target.checked)} />
              <span className="text-[13px]">Aplicar a M15 si existe</span>
            </label>
            <div className="p-3 rounded-2 border bg-gray-50 text-[13px]">
              Con ${Number(monto || 0).toFixed(2)} liquidas <strong>{liquidaSemanas}</strong> semana(s).
            </div>
          </div>
          <div className="px-4 py-3 border-t flex justify-end gap-2">
            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
            <button
              className="btn-primary !h-8 !px-3 text-xs"
              onClick={async ()=>{
                try {
                  if (!sel) return;
                  await allocateAndSavePayment(sel, Number(monto||0), aplicarM15);
                  onClose();
                } catch (e) {
                  console.error(e); alert("No se pudo registrar el pago.");
                }
              }}
              disabled={!sel || !monto || monto <= 0}
            >
              <Save className="w-4 h-4" /> Guardar pago
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ===== Editar pago (reaplicar) ===== */
  function EditPaymentModal({ pago, onClose }: { pago: Pago; onClose: () => void }) {
    const [monto, setMonto] = useState<number>(Number(pago.total));
    const [aplicarM15, setAplicarM15] = useState(false);

    const liquidaSemanas = useMemo(() => {
      if (!sel || monto <= 0) return 0;
      // Para previsualización rápida, usamos cuota estándar del crédito
      const cs = Number(sel.cuota_semanal || 0);
      if (!cs) return 0;
      return Math.floor(monto / cs);
    }, [monto, sel]);

    return (
      <div className="fixed inset-0 z-[10030] grid place-items-center bg-black/50">
        <div className="w-[92vw] max-w-md bg-white rounded-2 border shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-[13px] font-medium">Editar pago</div>
            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
          </div>
          <div className="p-4 grid gap-3">
            <div className="text-[12px] text-muted">
              Crédito: <strong>{sel?.folio ?? `#${sel?.id}`}</strong> — {sel?.titular}
            </div>
            <label className="block">
              <div className="text-[12px] text-gray-600 mb-1">Importe</div>
              <input className="input" type="number" step="0.01" value={monto} onChange={(e)=>setMonto(parseFloat(e.target.value || "0"))} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={aplicarM15} onChange={(e)=>setAplicarM15(e.target.checked)} />
              <span className="text-[13px]">Aplicar a M15 si existe</span>
            </label>
            <div className="p-3 rounded-2 border bg-gray-50 text-[13px]">
              Vista previa: con ${Number(monto || 0).toFixed(2)} liquidas aprox. {liquidaSemanas} semana(s).
            </div>
            <div className="alert alert--warn flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-[2px]" />
              <div className="text-[12.5px]">
                Editar reaplicará el pago: primero revierte sus partidas y luego redistribuye el nuevo monto.
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t flex justify-end gap-2">
            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
            <button
              className="btn-primary !h-8 !px-3 text-xs"
              onClick={async ()=>{
                try {
                  if (!sel) return;
                  await allocateAndSavePayment(sel, Number(monto||0), aplicarM15, pago.id);
                  onClose();
                } catch (e) {
                  console.error(e); alert("No se pudo editar el pago.");
                }
              }}
              disabled={!sel || !monto || monto <= 0}
            >
              <Save className="w-4 h-4" /> Guardar cambios
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ===== Acciones sobre pagos ===== */
  async function deletePago(p: Pago) {
    if (!confirm("¿Eliminar este pago? Se revertirán sus efectos sobre cuotas/multas.")) return;

    // revertir partidas
    const { data: parts } = await supabase.from("pago_partidas").select("*").eq("pago_id", p.id);
    for (const part of (parts || [])) {
      if (part.tipo === "CUOTA" && part.cuota_id) {
        const { data: c } = await supabase.from("creditos_cuotas").select("abonado,monto_programado").eq("id", part.cuota_id).maybeSingle();
        if (c) {
          const nuevo = Math.max(0, Number(c.abonado) - Number(part.monto));
          const pagada = nuevo >= Number(c.monto_programado);
          await supabase.from("creditos_cuotas").update({
            abonado: nuevo,
            estado: pagada ? "PAGADA" : "PENDIENTE",
            fecha_pago: pagada ? new Date().toISOString().slice(0,10) : null
          }).eq("id", part.cuota_id);
        }
      } else if (part.tipo === "MULTA" && part.multa_id) {
        const { data: m } = await supabase.from("multas").select("monto_pagado").eq("id", part.multa_id).maybeSingle();
        if (m) {
          const nuevo = Math.max(0, Number(m.monto_pagado) - Number(part.monto));
          await supabase.from("multas").update({
            monto_pagado: nuevo,
            estado: "ACTIVO",
            fecha_pago: null
          }).eq("id", part.multa_id);
        }
      }
    }
    await supabase.from("pago_partidas").delete().eq("pago_id", p.id);
    await supabase.from("pagos").delete().eq("id", p.id);

    if (sel) await loadCreditoData(sel.id);
  }

  /* ===== M15: aplicar/quitar ===== */
  async function applyM15() {
    if (!sel) return;
    if (multa) { alert("Ya existe una M15 activa."); return; }
    if (!confirm("¿Aplicar M15 (equivale a una cuota semanal)?")) return;
    const monto = Number(sel.cuota_semanal || 0);
    const { error } = await supabase.from("multas").insert({
      credito_id: sel.id,
      tipo: "M15",
      estado: "ACTIVO",
      monto,
      monto_pagado: 0
    });
    if (!error) await loadCreditoData(sel.id);
  }

  async function removeM15() {
    if (!sel || !multa) return;
    if (!confirm("¿Quitar M15 activa?")) return;
    const { error } = await supabase.from("multas").update({ estado: "INACTIVO", fecha_pago: new Date().toISOString() }).eq("id", multa.id);
    if (!error) await loadCreditoData(sel.id);
  }

  return (
    <div className="max-w-[1200px]">
      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="relative w-full sm:max-w-md">
            <input className="input" placeholder="Buscar crédito por folio o titular…" value={q} onChange={(e)=>setQ(e.target.value)} />
            {q && resultados.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 border rounded-2 bg-white max-h-72 overflow-auto z-20">
                {resultados.map(r => (
                  <button key={r.id}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50"
                    onClick={()=>selectCredito(r)}
                  >
                    {r.folio ?? `#${r.id}`} — {r.titular} <span className="text-muted">({r.sujeto})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button className="btn-primary btn--sm" disabled={!sel} onClick={()=>setOpenNew(true)}>
              <Plus className="w-4 h-4" /> Registrar pago
            </button>
            {!multa ? (
              <button className="btn-outline btn--sm" disabled={!sel} onClick={applyM15}>
                <ShieldAlert className="w-4 h-4" /> Aplicar M15
              </button>
            ) : (
              <button className="btn-outline btn--sm" disabled={!sel} onClick={removeM15}>
                <ShieldAlert className="w-4 h-4" /> Quitar M15
              </button>
            )}
          </div>
        </div>
      </div>

      {!sel ? (
        <div className="p-6 text-[13px] text-muted">
          Busca y selecciona un crédito para ver sus cuotas y pagos.
        </div>
      ) : (
        <>
          {/* Cabecera */}
          <div className="p-3 border rounded-2 mb-3 grid sm:grid-cols-2 gap-2">
            <div className="text-[13px]">
              <div className="text-muted text-[12px]">Crédito</div>
              <div className="font-medium">{sel.folio ?? `#${sel.id}`} — {sel.titular}</div>
            </div>
            <div className="text-[13px]">
              <div className="text-muted text-[12px]">Plan</div>
              <div>{sel.semanas} semanas — cuota ${sel.cuota_semanal.toFixed(2)}</div>
            </div>
            {multa && (
              <div className="sm:col-span-2 flex items-center gap-2 text-amber-700">
                <ShieldAlert className="w-4 h-4" />
                <div className="text-[12.5px]">M15 activa: ${Number(multa.monto - multa.monto_pagado).toFixed(2)} pendiente.</div>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Cuotas programadas */}
            <div className="border rounded-2 overflow-hidden">
              <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Cuotas programadas</div>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th>#</th>
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
                        {c.estado === "PAGADA" ? (
                          <span className="text-green-700 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> PAGADA</span>
                        ) : (
                          <span className="text-gray-700">{c.estado}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagos realizados */}
            <div className="border rounded-2 overflow-hidden">
              <div className="px-3 py-2 text-[12px] text-muted border-b bg-gray-50">Pagos realizados</div>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Total</th>
                    <th>Partidas</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin pagos.</td></tr>
                  ) : pagos.map(p => {
                    const parts = partidasByPago[p.id] || [];
                    return (
                      <tr key={p.id}>
                        <td className="text-[13px]">{new Date(p.fecha_pago).toLocaleString()}</td>
                        <td className="text-[13px]">${Number(p.total).toFixed(2)}</td>
                        <td className="text-[12.5px]">
                          {parts.length === 0 ? "—" :
                            parts.map(pt => pt.tipo === "CUOTA"
                              ? `Cuota#${pt.cuota_id} $${pt.monto}`
                              : `M15 $${pt.monto}`).join(", ")
                          }
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <button className="btn-outline btn--sm" onClick={()=>setOpenEdit({ open: true, pago: p })}>
                              <Pencil className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button className="btn-ghost btn--sm text-red-700" onClick={()=>deletePago(p)}>
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {openNew && sel && <NewPaymentModal onClose={()=>setOpenNew(false)} />}
      {openEdit.open && openEdit.pago && <EditPaymentModal pago={openEdit.pago} onClose={()=>setOpenEdit({open:false})} />}
    </div>
  );
}
