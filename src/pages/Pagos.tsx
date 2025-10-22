// src/pages/Pagos.tsx
import { useEffect, useMemo, useState } from "react";
import { Search, Save, AlertTriangle, RefreshCcw, XCircle, Pencil, Trash2, RotateCcw, ShieldAlert } from "lucide-react";
import {
  findCreditoPagable,
  getCuotas,
  getPagos,
  simularAplicacion,
  registrarPago,
  marcarNoPagoM15,
  regenerarCuotas,
  reaplicarPagosCredito, // se usa en onReaplicar
  editarPagoNota,        // <-- IMPORT CORRECTO
  eliminarPago,
  type CreditoPagable,
  type CuotaRow,
  type PagoRow,
  type TipoPago,
  money,
  titularDe
} from "../services/pagos.service";
import { listMultasByCredito, activarMulta, desactivarMulta, eliminarMulta, type Multa } from "../services/multas.service";

type Tab = "cuotas" | "pagos" | "multas";

export default function Pagos() {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const [cred, setCred] = useState<CreditoPagable | null>(null);
  const [cuotas, setCuotas] = useState<CuotaRow[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [multas, setMultas] = useState<Multa[]>([]);
  const [tab, setTab] = useState<Tab>("cuotas");
  const [err, setErr] = useState<string | null>(null);

  // Panel de pago
  const [tipo, setTipo] = useState<TipoPago>("CUOTA");
  const [monto, setMonto] = useState<number>(0);
  const [nota, setNota] = useState<string>("");

  const carteraVencida = useMemo(() => Number(cred?.cartera_vencida ?? 0), [cred]);
  const cuota = useMemo(() => Number(cred?.cuota ?? 0), [cred]);

  // Simulación
  const [simulando, setSimulando] = useState(false);
  const [simu, setSimu] = useState<{ num_semana: number; aplica: number; saldo_semana: number }[]>([]);

  // Edición de pago (nota)
  const [editPago, setEditPago] = useState<PagoRow | null>(null);
  const [editNota, setEditNota] = useState<string>("");

  function resetPagoPanel(c: CreditoPagable | null) {
    if (!c) return;
    setTipo("CUOTA");
    setMonto(Number(c.cuota || 0));
    setNota("");
    setSimu([]);
  }

  async function doSearch() {
    setErr(null);
    setLoading(true);
    try {
      const c = await findCreditoPagable(term);
      setCred(c);
      setCuotas([]);
      setPagos([]);
      setMultas([]);

      if (!c) {
        setErr("No se encontró un crédito con ese criterio.");
        return;
      }
      const [cc, pg, mu] = await Promise.all([
        getCuotas(c.id),
        getPagos(c.id),
        listMultasByCredito(c.id),
      ]);
      setCuotas(cc);
      setPagos(pg);
      setMultas(mu);

      if ((cc?.length ?? 0) === 0) {
        setErr("Este crédito no tiene cuotas generadas. Usa 'Re-generar cuotas'.");
      }

      resetPagoPanel(c);
    } catch (e: any) {
      setErr(e.message || "Error al buscar.");
    } finally {
      setLoading(false);
    }
  }

  // Ajusta monto al cambiar tipo
  useEffect(() => {
    if (!cred) return;
    if (tipo === "CUOTA") setMonto(cuota);
    else if (tipo === "VENCIDA") setMonto(Math.max(carteraVencida, 0));
    setSimu([]);
  }, [tipo, cred, cuota, carteraVencida]);

  // Simulación automática
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!cred) { setSimu([]); return; }
      const m = Number(monto);
      if (!Number.isFinite(m) || m <= 0) { setSimu([]); return; }
      setSimulando(true);
      try {
        const res = await simularAplicacion(cred.id, m);
        if (!alive) return;
        setSimu(res.map(r => ({
          num_semana: r.num_semana,
          aplica: Number(r.aplica),
          saldo_semana: Number(r.saldo_semana),
        })));
      } catch {
        if (alive) setSimu([]);
      } finally {
        if (alive) setSimulando(false);
      }
    })();
    return () => { alive = false; };
  }, [monto, cred]);

  async function refreshCredito() {
    if (!cred) return;
    const idKey = String(cred.folio_externo ?? cred.folio_publico ?? cred.id);
    const cRef = await findCreditoPagable(idKey);
    if (cRef) setCred(cRef);
    const [cc, pg, mu] = await Promise.all([
      getCuotas(cred.id),
      getPagos(cred.id),
      listMultasByCredito(cred.id),
    ]);
    setCuotas(cc);
    setPagos(pg);
    setMultas(mu);
    if (cc.length > 0) setErr(null);
  }

  async function onRegistrarPago() {
    if (!cred) return;
    if ((cuotas?.length ?? 0) === 0) {
      alert("No hay cuotas generadas. Primero usa 'Re-generar cuotas'.");
      return;
    }
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) {
      alert("Indica un monto válido.");
      return;
    }
    if (tipo === "VENCIDA" && carteraVencida <= 0) {
      alert("No hay cartera vencida para aplicar este pago.");
      return;
    }

    const warnAnticipado = tipo !== "VENCIDA" && simu.length > 0 && simu[0]?.num_semana > 1;
    if (warnAnticipado) {
      const ok = confirm(`Estás pagando semanas por adelantado (siguiente: #${simu[0].num_semana}). ¿Continuar?`);
      if (!ok) return;
    }

    try {
      const res = await registrarPago(cred.id, m, tipo, nota || undefined);
      await refreshCredito();
      setNota("");
      alert(`Pago registrado (#${res.pago_id}). Restante no aplicado: ${money(res.restante_no_aplicado)}`);
    } catch (e: any) {
      alert(e.message || "Error al registrar pago.");
    }
  }

  async function onNoPagoM15() {
    if (!cred) return;
    const sure = confirm("¿Marcar NO PAGO (M15) a la semana con saldo pendiente más próxima? Esto actualizará el estado de la cuota y generará la multa.");
    if (!sure) return;
    try {
      const r = await marcarNoPagoM15(cred.id);
      if (!r.ok) {
        alert(r.msg ?? "No se pudo marcar M15.");
      } else {
        await refreshCredito();
        alert(`Semana ${r.semana} marcada como VENCIDA y M15 registrada.`);
      }
    } catch (e: any) {
      alert(e.message || "Error al aplicar No Pago (M15).");
    }
  }

  async function onRegenerarCuotas() {
    if (!cred) return;
    const sure = confirm("Intentará re-generar las cuotas faltantes para este crédito. ¿Continuar?");
    if (!sure) return;
    try {
      await regenerarCuotas(cred.id);
      await refreshCredito();
      alert("Cuotas generadas/recuperadas.");
    } catch (e: any) {
      alert(e.message || "Ocurrió un error al generar cuotas.");
    }
  }

  async function onReaplicar() {
    if (!cred) return;
    const sure = confirm("Re-aplicará todos los pagos del crédito y recomputará estados de cuotas. ¿Continuar?");
    if (!sure) return;
    try {
      await reaplicarPagosCredito(cred.id);
      await refreshCredito();
      alert("Pagos re-aplicados y cuotas recomputadas.");
    } catch (e: any) {
      alert(e.message || "Error al re-aplicar pagos.");
    }
  }

  // Editar nota de pago
  function startEditPago(p: PagoRow) {
    setEditPago(p);
    setEditNota(p.nota ?? "");
  }
  async function saveEditPago() {
    if (!editPago) return;
    try {
      await editarPagoNota(editPago.id, editNota || null);
      setEditPago(null);
      await refreshCredito();
      alert("Nota actualizada.");
    } catch (e: any) {
      alert(e.message || "No se pudo actualizar la nota.");
    }
  }
  function cancelEdit() {
    setEditPago(null);
  }

  // Eliminar pago
  async function onEliminarPago(p: PagoRow) {
    const msg = `Vas a eliminar el pago #${p.id} por ${money(p.monto)} (${p.tipo}). Esto revertirá sus aplicaciones a cuotas. ¿Confirmar?`;
    const sure = confirm(msg);
    if (!sure) return;
    try {
      await eliminarPago(p.id);
      await refreshCredito();
      alert("Pago eliminado y aplicaciones revertidas.");
    } catch (e: any) {
      alert(e.message || "No se pudo eliminar el pago.");
    }
  }

  const avanceLabel = useMemo(() => {
    if (!cred) return "—";
    const pag = Number(cred.semanas_pagadas ?? 0);
    const tot = Number(cred.semanas_plan ?? 0);
    return `${pag} de ${tot}`;
  }, [cred]);

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="dt__search--sm">
            <input
              className="input"
              placeholder="Buscar (folio externo, CR-#, nombre)"
              value={term}
              onChange={(e)=>setTerm(e.target.value)}
              onKeyDown={(e)=>{ if (e.key === "Enter") doSearch(); }}
            />
          </div>
          <div className="self-end">
            <button className="btn-primary btn--sm" onClick={doSearch} disabled={loading}>
              <Search className="w-4 h-4" /> Buscar
            </button>
          </div>
          <div />
        </div>
      </div>

      {/* Alert si falta generar cuotas + botones de rescate */}
      {!!err && (
        <div className="px-3">
          <div className="alert alert--error flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <div className="flex-1">{err}</div>
            <div className="flex gap-2">
              {cred && <button className="btn-outline btn--sm" onClick={onRegenerarCuotas}><RefreshCcw className="w-4 h-4" /> Re-generar cuotas</button>}
              {cred && <button className="btn-outline btn--sm" onClick={onReaplicar}><RotateCcw className="w-4 h-4" /> Re-aplicar pagos</button>}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      {cred ? (
        <div className="p-3 grid lg:grid-cols-2 gap-3">
          {/* Resumen */}
          <div className="card p-3 grid gap-2">
            <div className="text-[13px] font-semibold">
              Crédito: {cred.folio_publico ?? cred.folio_externo ?? `CR-${cred.id}`}
            </div>
            <div className="grid sm:grid-cols-2 gap-2 text-[13px]">
              <div><div className="text-muted text-[12px]">Titular</div><div>{titularDe(cred)}</div></div>
              <div><div className="text-muted text-[12px]">Sujeto</div><div>{cred.sujeto}</div></div>
              <div><div className="text-muted text-[12px]">Monto total</div><div>{money(cred.monto_total)}</div></div>
              <div><div className="text-muted text-[12px]">Cuota semanal</div><div>{money(cred.cuota)}</div></div>
              <div><div className="text-muted text-[12px]">Adeudo total</div><div>{money(cred.adeudo_total)}</div></div>
              <div><div className="text-muted text-[12px]">Cartera vencida</div><div className={Number(cred.cartera_vencida)>0 ? "text-red-700":""}>{money(cred.cartera_vencida)}</div></div>
              <div><div className="text-muted text-[12px]">Avance</div><div><span className="badge">{avanceLabel}</span></div></div>
              <div><div className="text-muted text-[12px]">Fecha disposición</div><div>{cred.fecha_disposicion ?? "—"}</div></div>
              <div><div className="text-muted text-[12px]">Primer pago (base)</div><div>{cred.primer_pago ?? "—"}</div></div>
            </div>
          </div>

          {/* Pagar */}
          <div className="card p-3 grid gap-3">
            <div className="text-[13px] font-semibold">Registrar pago</div>

            <div className="grid grid-cols-3 gap-2 text-[13px]">
              <label className="border rounded-2 p-2 flex gap-2 items-center">
                <input type="radio" name="tipo" checked={tipo==="CUOTA"} onChange={()=>setTipo("CUOTA")} />
                <div className="flex-1">
                  <div className="font-medium">Cuota semanal</div>
                  <div className="text-[12px] text-muted">{money(cuota)}</div>
                </div>
              </label>

              <label className={`border rounded-2 p-2 flex gap-2 items-center ${Number(cred.cartera_vencida)<=0 ? "opacity-60" : ""}`}>
                <input type="radio" name="tipo" checked={tipo==="VENCIDA"} onChange={()=>setTipo("VENCIDA")} disabled={Number(cred.cartera_vencida)<=0} />
                <div className="flex-1">
                  <div className="font-medium">Cuota vencida</div>
                  <div className="text-[12px] text-muted">{Number(cred.cartera_vencida)>0 ? money(cred.cartera_vencida) : "Sin vencidos"}</div>
                </div>
              </label>

              <label className="border rounded-2 p-2 flex gap-2 items-center">
                <input type="radio" name="tipo" checked={tipo==="ABONO"} onChange={()=>setTipo("ABONO")} />
                <div className="flex-1">
                  <div className="font-medium">Abono</div>
                  <div className="text-[12px] text-muted">Monto libre</div>
                </div>
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-2">
              <label className="block sm:col-span-1">
                <div className="text-[12px] text-muted mb-1">Monto</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={monto}
                  onChange={(e)=>setMonto(Number(e.target.value || 0))}
                  disabled={tipo === "CUOTA" || (tipo === "VENCIDA" && Number(cred.cartera_vencida)>0)}
                />
              </label>

              <label className="block sm:col-span-2">
                <div className="text-[12px] text-muted mb-1">Nota (opcional)</div>
                <input className="input" placeholder="Observaciones del pago…" value={nota} onChange={(e)=>setNota(e.target.value)} />
              </label>
            </div>

            {/* Simulador */}
            <div className="border rounded-2 p-2">
              <div className="text-[12.5px] font-medium mb-1">Simulación</div>
              {simulando ? (
                <div className="text-[12.5px] text-muted">Calculando…</div>
              ) : simu.length === 0 ? (
                <div className="text-[12.5px] text-muted">Indica un monto para ver cómo se aplicará a las próximas semanas.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left text-[12px] text-muted">Semana</th>
                        <th className="text-right text-[12px] text-muted">Aplica</th>
                        <th className="text-right text-[12px] text-muted">Saldo semana</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simu.map(s=>(
                        <tr key={s.num_semana}>
                          <td className="text-[13px] py-1">#{s.num_semana}</td>
                          <td className="text-[13px] py-1 text-right">{money(s.aplica)}</td>
                          <td className="text-[13px] py-1 text-right">{money(s.saldo_semana)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button className="btn-outline btn--sm" onClick={onNoPagoM15}>
                <XCircle className="w-4 h-4" /> No pago (M15)
              </button>
              <button className="btn-primary btn--sm" onClick={onRegistrarPago} disabled={(cuotas?.length ?? 0)===0}>
                <Save className="w-4 h-4" /> Registrar pago
              </button>
            </div>
          </div>

          {/* Historial */}
          <div className="lg:col-span-2">
            <div className="flex gap-2 border-b">
              <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==='cuotas' ? 'nav-active':''}`} onClick={()=>setTab("cuotas")}>Cuotas</button>
              <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==='pagos' ? 'nav-active':''}`} onClick={()=>setTab("pagos")}>Pagos realizados</button>
              <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==='multas' ? 'nav-active':''}`} onClick={()=>setTab("multas")}>Multas</button>
            </div>

            {tab === "cuotas" ? (
              <div className="table-frame overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Semana</th>
                      <th>Fecha</th>
                      <th className="text-right">Programado</th>
                      <th className="text-right">Abonado</th>
                      <th className="text-center">M15</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuotas.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-[13px] text-muted py-4">Sin cuotas.</td></tr>
                    ) : cuotas.map(c => (
                      <tr key={c.id}>
                        <td className="text-[13px] text-center">#{c.num_semana}</td>
                        <td className="text-[13px] text-center">{c.fecha_programada}</td>
                        <td className="text-[13px] text-right">{money(c.monto_programado)}</td>
                        <td className="text-[13px] text-right">{money(c.abonado)}</td>
                        <td className="text-[13px] text-center">
                          {c.m15_count > 0 ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-2 text-[11px] ${c.m15_activa ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                              <ShieldAlert className="w-3 h-3" /> M15
                            </span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className="text-[13px]">
                          {c.estado === "PAGADA" ? <span className="text-green-700 font-medium">PAGADA</span>
                          : c.estado === "VENCIDA" ? <span className="text-red-700 font-medium">VENCIDA</span>
                          : c.estado === "PARCIAL" ? <span className="text-amber-700 font-medium">PARCIAL</span>
                          : <span className="text-gray-600">PENDIENTE</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === "pagos" ? (
              <div className="table-frame overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th className="text-right">Monto</th>
                      <th>Nota</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-[13px] text-muted py-4">Sin pagos registrados.</td></tr>
                    ) : pagos.map(p => (
                      <tr key={p.id}>
                        <td className="text-[13px]">{new Date(p.fecha).toLocaleString()}</td>
                        <td className="text-[13px]">{p.tipo}</td>
                        <td className="text-[13px] text-right">{money(p.monto)}</td>
                        <td className="text-[13px]">{p.nota ?? "—"}</td>
                        <td className="text-center">
                          <div className="inline-flex gap-2">
                            <button className="btn-outline btn--sm" onClick={()=>{ setEditPago(p); setEditNota(p.nota ?? ""); }}>
                              <Pencil className="w-4 h-4" /> Editar
                            </button>
                            <button className="btn-outline btn--sm" onClick={()=>onEliminarPago(p)}>
                              <Trash2 className="w-4 h-4" /> Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-frame overflow-x-auto mt-2">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Creación</th>
                      <th>Semana</th>
                      <th>Activa</th>
                      <th>Estado</th>
                      <th className="text-right">Monto</th>
                      <th className="text-right">Pagado</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multas.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-[13px] text-muted py-4">Sin multas.</td></tr>
                    ) : multas.map(m => (
                      <tr key={m.id}>
                        <td className="text-[13px]">{new Date(m.fecha_creacion).toLocaleString()}</td>
                        <td className="text-[13px] text-center">#{m.semana ?? "—"}</td>
                        <td className="text-[13px] text-center">{m.activa ? "Sí" : "No"}</td>
                        <td className="text-[13px]">{m.estado}</td>
                        <td className="text-[13px] text-right">{money(m.monto)}</td>
                        <td className="text-[13px] text-right">{money(m.monto_pagado)}</td>
                        <td className="text-center">
                          <div className="inline-flex gap-2">
                            <button className="btn-outline btn--sm" onClick={()=>{ m.activa ? desactivarMulta(m.id) : activarMulta(m.id); refreshCredito(); }}>
                              {m.activa ? "Desactivar" : "Activar"}
                            </button>
                            <button className="btn-outline btn--sm" onClick={()=>{ if(confirm(`Eliminar la multa #${m.id}?`)){ eliminarMulta(m.id).then(refreshCredito); } }}>
                              <Trash2 className="w-4 h-4" /> Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 text-[13px] text-muted">
          Busca un crédito por <b>folio externo</b>, <b>CR-#</b> o <b>nombre</b> para ver su resumen, registrar pagos y gestionar M15.
        </div>
      )}

      {/* Modal simple para editar nota */}
      {editPago && (
        <div className="modal">
          <div className="modal-card modal-card-sm">
            <div className="modal-head">
              <div className="text-[13px] font-medium">Editar nota del pago #{editPago.id}</div>
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={cancelEdit}>Cerrar</button>
            </div>
            <div className="p-3 grid gap-2">
              <div className="text-[12.5px]">Monto: <b>{money(editPago.monto)}</b> — Tipo: <b>{editPago.tipo}</b></div>
              <label className="block">
                <div className="text-[12px] text-muted mb-1">Nota</div>
                <input className="input" value={editNota} onChange={(e)=>setEditNota(e.target.value)} />
              </label>
              <div className="flex justify-end gap-2">
                <button className="btn-outline btn--sm" onClick={cancelEdit}>Cancelar</button>
                <button className="btn-primary btn--sm" onClick={saveEditPago}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
