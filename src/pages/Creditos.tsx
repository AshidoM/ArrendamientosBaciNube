import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import {
  Plus, Eye, MoreVertical, X, Save, AlertTriangle, Trash2,
} from "lucide-react";

type Sujeto = "CLIENTE" | "COORDINADORA";
type EstadoCredito = "ACTIVO" | "FINALIZADO" | "REZAGADO";

type CreditoRow = {
  id: number;
  folio: string | null;
  sujeto: Sujeto;
  titular: string;
  semanas: number;
  cuota_semanal: number;
  monto_principal: number;
  estado: EstadoCredito;
  poblacion_id: number;
  poblacion: string;
  ruta_id: number;
  ruta: string;
};

type Plan = { id: number; sujeto: Sujeto; semanas: number; activo: boolean };
type Poblacion = { id: number; nombre: string; ruta_id: number | null };
type ActivoCredito = { id: number; semanas: number; cuota_semanal: number };

function isNumber(v: any) { return typeof v === "number" && !Number.isNaN(v); }

// Tipo A (14 cliente / 10 coord): 1000→110; +500 → +50
function cuotaTipoA(monto: number): number | null {
  if (monto < 1000) return null;
  const pasos = Math.round((monto - 1000) / 500);
  if (1000 + pasos * 500 !== monto) return null;
  return 110 + pasos * 50;
}
// Tipo B (13 cliente / 9 coord): mapa fijo
const mapaTipoB: Record<number, number> = {
  1000: 120, 1500: 180, 2000: 230, 2500: 280, 3000: 340, 3500: 390, 4000: 450,
};
function cuotaTipoB(monto: number): number | null {
  return mapaTipoB[monto] ?? null;
}
const montosTipoA = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];
const montosTipoB = [1000, 1500, 2000, 2500, 3000, 3500, 4000];

export default function Creditos() {
  const [rows, setRows] = useState<CreditoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [q, setQ] = useState("");

  const [menu, setMenu] = useState<{open:boolean;x:number;y:number; row?:CreditoRow}>({open:false,x:0,y:0});
  const [viewRow, setViewRow] = useState<CreditoRow|null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const close = () => setMenu(s => ({ ...s, open: false }));
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("click", close);
    };
  }, []);

  async function load() {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("vw_credito_resumen")
      .select("credito_id, folio, sujeto, titular, semanas, cuota_semanal, monto_principal, estado, poblacion_id, poblacion, ruta_id, ruta", { count: "exact" })
      .order("credito_id", { ascending: false });

    const qq = q.trim();
    if (qq) query = query.or(`folio.ilike.%${qq}%,titular.ilike.%${qq}%`);

    const { data, error, count } = await query.range(from, to);
    if (!error) {
      const mapped: CreditoRow[] = (data || []).map((r: any) => ({
        id: r.credito_id,
        folio: r.folio,
        sujeto: r.sujeto,
        titular: r.titular,
        semanas: r.semanas,
        cuota_semanal: Number(r.cuota_semanal || 0),
        monto_principal: Number(r.monto_principal || 0),
        estado: r.estado,
        poblacion_id: r.poblacion_id,
        poblacion: r.poblacion,
        ruta_id: r.ruta_id,
        ruta: r.ruta,
      }));
      setRows(mapped);
      setTotal(count ?? mapped.length);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, q]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function openMenuFor(btn: HTMLButtonElement, row: CreditoRow) {
    const r = btn.getBoundingClientRect();
    setMenu({ open: true, x: Math.min(window.innerWidth - 220, r.right - 200), y: r.bottom + 6, row });
  }

  async function deleteCredit(row: CreditoRow) {
    const folioTxt = row.folio ?? `#${row.id}`;
    if (!confirm(`¿Eliminar el crédito ${folioTxt}?\nSe eliminarán cuotas, pagos y multas asociadas.`)) return;
    const { error } = await supabase.from("creditos").delete().eq("id", row.id);
    if (error) { console.error(error); alert("No se pudo eliminar el crédito."); return; }
    setMenu(s => ({ ...s, open: false }));
    load();
  }

  return (
    <div className="max-w-[1250px]">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <input
            className="input"
            placeholder="Buscar por folio o titular…"
            value={q}
            onChange={(e)=>{ setPage(1); setQ(e.target.value); }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-gray-600">Mostrar</span>
            <select
              className="input input--sm"
              value={pageSize}
              onChange={(e)=>{ setPage(1); setPageSize(parseInt(e.target.value)); }}
            >
              {[5,8,10,15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary btn--sm" onClick={()=>setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Crear crédito
            </button>
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
              <th>Monto</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[13px] text-gray-500">Sin resultados.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="text-[13px]">{r.folio ?? `#${r.id}`}</td>
                <td className="text-[13px]">{r.titular}</td>
                <td className="text-[13px]">{r.sujeto}</td>
                <td className="text-[13px]">{r.semanas}</td>
                <td className="text-[13px]">${r.cuota_semanal.toFixed(2)}</td>
                <td className="text-[13px]">${r.monto_principal.toFixed(2)}</td>
                <td className="text-[13px]">
                  {r.estado === "ACTIVO" ? <span className="text-[var(--baci-blue)] font-medium">ACTIVO</span> :
                   r.estado === "FINALIZADO" ? <span className="text-gray-700">FINALIZADO</span> :
                   <span className="text-amber-700">REZAGADO</span>}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-outline btn--sm" onClick={()=>setViewRow(r)}>
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button
                      className="btn-outline btn--sm"
                      onClick={(e)=>{ e.stopPropagation(); openMenuFor(e.currentTarget, r); }}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer paginación */}
      <div className="dt__footer">
        <div className="text-[12.5px] text-gray-600">
          {total === 0 ? "0" : `${(page-1)*pageSize + 1}–${Math.min(page*pageSize, total)}`} de {total}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline btn--sm" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</button>
          <span className="text-[12.5px]">Página</span>
          <input
            className="input input--sm input--pager"
            value={page}
            onChange={(e)=>setPage(Math.max(1, parseInt(e.target.value||"1")))}
          />
          <span className="text-[12.5px]">de {pages}</span>
          <button className="btn-outline btn--sm" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Siguiente</button>
        </div>
      </div>

      {/* Menú portal */}
      {menu.open && menu.row && createPortal(
        <div className="portal-menu" style={{ left: menu.x, top: menu.y }} onClick={(e)=>e.stopPropagation()}>
          <button className="portal-menu__item" onClick={()=>{ setViewRow(menu.row!); setMenu(s=>({...s,open:false})); }}>
            <Eye className="w-4 h-4" /> Ver
          </button>
          <button className="portal-menu__item portal-menu__item--danger" onClick={()=>deleteCredit(menu.row!)}>
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>,
        document.body
      )}

      {viewRow && <ViewCredito row={viewRow} onClose={()=>setViewRow(null)} />}
      {createOpen && <CrearCreditoModalTabs onClose={()=>{ setCreateOpen(false); load(); }} />}
    </div>
  );
}

function ViewCredito({ row, onClose }: { row: CreditoRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10030] grid place-items-center bg-black/50">
      <div className="w-[92vw] max-w-2xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="modal-head">
          <div className="text-[13px] font-medium">Crédito {row.folio ?? `#${row.id}`}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-3 text=[13px]">
          <div><strong>Titular:</strong> {row.titular}</div>
          <div><strong>Sujeto:</strong> {row.sujeto}</div>
          <div><strong>Semanas:</strong> {row.semanas}</div>
          <div><strong>Cuota:</strong> ${row.cuota_semanal.toFixed(2)}</div>
          <div><strong>Monto:</strong> ${row.monto_principal.toFixed(2)}</div>
          <div><strong>Estado:</strong> {row.estado}</div>
          <div><strong>Población:</strong> {row.poblacion}</div>
          <div><strong>Ruta:</strong> {row.ruta}</div>
        </div>
      </div>
    </div>
  );
}

function CrearCreditoModalTabs({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"datos"|"resumen">("datos");

  const [sujeto, setSujeto] = useState<Sujeto>("CLIENTE");
  const [qTitular, setQTitular] = useState("");
  const [resultTitulares, setResultTitulares] = useState<any[]>([]);
  const [titularSel, setTitularSel] = useState<any | null>(null);

  const [planes, setPlanes] = useState<Plan[]>([]);
  const [planSemanas, setPlanSemanas] = useState<number | null>(null);
  const [monto, setMonto] = useState<number | null>(null);
  const [papeleria, setPapeleria] = useState<number>(0);
  const [fecha1, setFecha1] = useState<string>(""); // yyyy-mm-dd

  const [poblacion, setPoblacion] = useState<Poblacion | null>(null);
  const [rutaId, setRutaId] = useState<number | null>(null);

  const [adeudoCuotas, setAdeudoCuotas] = useState<number>(0);
  const [multaActiva, setMultaActiva] = useState<number>(0);
  const [creditoActivo, setCreditoActivo] = useState<ActivoCredito | null>(null);

  useEffect(() => {
    const run = async () => {
      const t = qTitular.trim();
      if (!t) { setResultTitulares([]); return; }
      if (sujeto === "CLIENTE") {
        const { data } = await supabase
          .from("clientes")
          .select("*")
          .or(`nombre.ilike.%${t}%,folio.ilike.%${t}%`)
          .limit(8);
        setResultTitulares(data || []);
      } else {
        const { data } = await supabase
          .from("coordinadoras")
          .select("*")
          .or(`nombre.ilike.%${t}%,folio.ilike.%${t}%`)
          .limit(8);
        setResultTitulares(data || []);
      }
    };
    run();
  }, [qTitular, sujeto]);

  useEffect(() => {
    const run = async () => {
      const permitidas = sujeto === "CLIENTE" ? [14, 13] : [10, 9];
      const { data } = await supabase
        .from("planes")
        .select("*")
        .eq("sujeto", sujeto)
        .in("semanas", permitidas)
        .eq("activo", true)
        .order("semanas", { ascending: false });
      setPlanes((data || []) as any);
      setPlanSemanas(null);
      setMonto(null);
    };
    run();
  }, [sujeto]);

  useEffect(() => {
    if (!titularSel) { setPoblacion(null); setRutaId(null); setAdeudoCuotas(0); setMultaActiva(0); setCreditoActivo(null); return; }
    const run = async () => {
      let pobId: number | null = null;

      if (sujeto === "COORDINADORA") {
        pobId = titularSel.poblacion_id ?? null;
      } else {
        if (typeof titularSel.poblacion_id !== "undefined") {
          pobId = titularSel.poblacion_id ?? null;
        }
        if (!pobId) {
          try {
            const { data } = await supabase
              .from("cliente_poblaciones")
              .select("poblacion_id").eq("cliente_id", titularSel.id).eq("activo", true).limit(1);
            if (data && data[0]) pobId = data[0].poblacion_id as number;
          } catch {}
          if (!pobId) {
            try {
              const { data } = await supabase
                .from("poblaciones_clientes")
                .select("poblacion_id").eq("cliente_id", titularSel.id).eq("activo", true).limit(1);
              if (data && data[0]) pobId = data[0].poblacion_id as number;
            } catch {}
          }
        }
      }

      if (pobId) {
        const { data: p } = await supabase.from("poblaciones").select("id,nombre,ruta_id").eq("id", pobId).maybeSingle();
        if (p) {
          setPoblacion(p as any);
          setRutaId((p as any).ruta_id ?? null);
        }
      } else {
        setPoblacion(null);
        setRutaId(null);
      }

      const filtro: any = { sujeto };
      if (sujeto === "CLIENTE") filtro.cliente_id = titularSel.id;
      else filtro.coordinadora_id = titularSel.id;

      const { data: cA } = await supabase
        .from("creditos")
        .select("id, semanas, cuota_semanal, estado")
        .match(filtro).eq("estado", "ACTIVO")
        .order("created_at", { ascending: false }).limit(1);

      if (cA && cA[0]) {
        setCreditoActivo({ id: cA[0].id, semanas: cA[0].semanas, cuota_semanal: Number(cA[0].cuota_semanal) });
        const [{ data: cuotas }, { data: multa }] = await Promise.all([
          supabase.from("creditos_cuotas").select("monto_programado, abonado, estado").eq("credito_id", cA[0].id),
          supabase.from("multas").select("monto, monto_pagado, estado").eq("credito_id", cA[0].id).eq("estado", "ACTIVO").maybeSingle(),
        ]);
        const ade = (cuotas || []).reduce((acc, c: any) => {
          const rest = Math.max(0, Number(c.monto_programado) - Number(c.abonado));
          return acc + rest;
        }, 0);
        setAdeudoCuotas(ade);
        setMultaActiva(multa ? Math.max(0, Number(multa.monto) - Number(multa.monto_pagado)) : 0);
      } else {
        setCreditoActivo(null);
        setAdeudoCuotas(0);
        setMultaActiva(0);
      }
    };
    run();
  }, [titularSel, sujeto]);

  const montosDisponibles = useMemo(() => {
    if (!planSemanas) return [];
    const tipoA = sujeto === "CLIENTE" ? planSemanas === 14 : planSemanas === 10;
    return tipoA ? montosTipoA : montosTipoB;
  }, [planSemanas, sujeto]);

  const cuotaSemanal = useMemo(() => {
    if (!isNumber(monto) || !planSemanas) return null;
    const tipoA = sujeto === "CLIENTE" ? planSemanas === 14 : planSemanas === 10;
    return tipoA ? cuotaTipoA(monto!) : cuotaTipoB(monto!);
  }, [monto, planSemanas, sujeto]);

  const neto = useMemo(() => {
    const m15 = Number(multaActiva || 0);
    const ade = Number(adeudoCuotas || 0);
    const pap = Number(papeleria || 0);
    const base = Number(monto || 0);
    if (!base) return 0;
    return Math.max(0, base - pap - ade - m15);
  }, [monto, papeleria, adeudoCuotas, multaActiva]);

  const puedeGuardar = !!titularSel && !!planSemanas && isNumber(monto) && !!cuotaSemanal && !!fecha1 && !!poblacion?.id && !!rutaId;

  async function guardar() {
    if (!puedeGuardar) return;
    const { data: plan } = await supabase
      .from("planes").select("id").eq("sujeto", sujeto).eq("semanas", planSemanas).maybeSingle();
    if (!plan) { alert("No existe plan configurado para esas semanas."); return; }

    const cuota = Number(cuotaSemanal);
    const payload: any = {
      sujeto,
      cliente_id: sujeto === "CLIENTE" ? titularSel.id : null,
      coordinadora_id: sujeto === "COORDINADORA" ? titularSel.id : null,
      poblacion_id: poblacion?.id!,
      ruta_id: rutaId!,
      plan_id: plan.id,
      semanas: planSemanas!,
      monto_principal: Number(monto),
      cuota_semanal: cuota,
      papeleria_aplicada: Number(papeleria || 0),
      fecha_disposicion: new Date().toISOString().slice(0, 10),
      observaciones: null,
    };

    const { data: ins, error } = await supabase.from("creditos").insert(payload).select("id").single();
    if (error) { console.error(error); alert("No se pudo crear el crédito."); return; }
    const creditoId = ins!.id as number;

    const f0 = new Date(fecha1 + "T00:00:00");
    const filas = [];
    for (let i = 0; i < planSemanas!; i++) {
      const d = new Date(f0);
      d.setDate(d.getDate() + i * 7);
      filas.push({
        credito_id: creditoId,
        num_semana: i + 1,
        fecha_programada: d.toISOString().slice(0, 10),
        monto_programado: cuota,
        abonado: 0,
        estado: "PENDIENTE",
        fecha_pago: null,
      });
    }
    await supabase.from("creditos_cuotas").insert(filas);
    await supabase.from("creditos_hist").insert({
      credito_id: creditoId, evento: "CREACION", meta: { sujeto, semanas: planSemanas, monto, cuota }
    });
    alert("Crédito creado.");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-2xl bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-11 px-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="datos"?"nav-active":""}`} onClick={()=>setTab("datos")}>Datos</button>
            <button className={`btn-ghost !h-8 !px-3 text-xs ${tab==="resumen"?"nav-active":""}`} onClick={()=>setTab("resumen")}>Resumen</button>
          </div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}><X className="w-4 h-4" /> Cerrar</button>
        </div>

        {tab==="datos" && (
          <div className="p-4 grid gap-3">
            <label className="block">
              <div className="text-[12px] text-gray-600 mb-1">Sujeto</div>
              <select className="input" value={sujeto} onChange={(e)=>{ setSujeto(e.target.value as Sujeto); setTitularSel(null); setQTitular(""); }}>
                <option value="CLIENTE">CLIENTE</option>
                <option value="COORDINADORA">COORDINADORA</option>
              </select>
            </label>

            <div className="block">
              <div className="text-[12px] text-gray-600 mb-1">Titular</div>
              <div className="relative">
                <input
                  className="input"
                  placeholder={`Buscar ${sujeto === "CLIENTE" ? "cliente" : "coordinadora"}…`}
                  value={qTitular}
                  onChange={(e)=>{ setQTitular(e.target.value); setTitularSel(null); }}
                />
                {qTitular && resultTitulares.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 border rounded-2 bg-white max-h-64 overflow-auto z-20">
                    {resultTitulares.map((r:any)=>(
                      <button
                        key={r.id}
                        className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50"
                        onClick={()=>{ setTitularSel(r); setQTitular(`${r.folio ?? ""} ${r.nombre}`.trim()); }}
                      >
                        {r.folio ?? ""} {r.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!poblacion && titularSel && (
                <div className="mt-2 alert alert--warn flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-[1px]" />
                  <div className="text-[12.5px]">
                    Este titular no tiene Población asignada. Asigna primero una Población (y su Ruta) antes de crear el crédito.
                  </div>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block sm:col-span-1">
                <div className="text-[12px] text-gray-600 mb-1">Semanas</div>
                <select className="input" value={planSemanas ?? ""} onChange={(e)=>{ setPlanSemanas(e.target.value ? Number(e.target.value) : null); setMonto(null); }}>
                  <option value="">—</option>
                  {(sujeto === "CLIENTE" ? [14,13] : [10,9]).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block sm:col-span-1">
                <div className="text-[12px] text-gray-600 mb-1">Monto</div>
                <select className="input" value={monto ?? ""} onChange={(e)=>setMonto(e.target.value ? Number(e.target.value) : null)} disabled={!planSemanas}>
                  <option value="">—</option>
                  {(planSemanas && ((sujeto === "CLIENTE" && planSemanas === 14) || (sujeto === "COORDINADORA" && planSemanas === 10)) ? montosTipoA : montosTipoB)
                    .map(m => <option key={m} value={m}>{m}</option>)
                  }
                </select>
              </label>
              <div className="sm:col-span-1 grid gap-1">
                <div className="text-[12px] text-gray-600">Cuota semanal</div>
                <div className="text-[13px] font-medium">{(cuotaSemanal ?? 0) ? `$${cuotaSemanal!.toFixed(2)}` : "—"}</div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Papelería aplicada</div>
                <input className="input" type="number" step="0.01" value={papeleria} onChange={(e)=>setPapeleria(parseFloat(e.target.value||"0"))} />
              </label>
              <label className="block">
                <div className="text-[12px] text-gray-600 mb-1">Fecha 1er pago</div>
                {/* sin ícono superpuesto */}
                <input className="input" type="date" value={fecha1} onChange={(e)=>setFecha1(e.target.value)} />
              </label>
            </div>

            <div className="p-3 border rounded-2 bg-gray-50">
              <div className="text-[12px] text-muted mb-1">Origen (automático del titular)</div>
              <div className="text-[13px]">
                Población: <strong>{poblacion?.nombre ?? "—"}</strong><br />
                Ruta ID: <strong>{rutaId ?? "—"}</strong>
              </div>
            </div>
          </div>
        )}

        {tab==="resumen" && (
          <div className="p-4 grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-3 border rounded-2">
                <div className="text-[12px] text-muted mb-1">Titular</div>
                <div className="text-[13px]">
                  <strong>{qTitular || "—"}</strong><br/>
                  Sujeto: <strong>{sujeto}</strong><br/>
                  Semanas: <strong>{planSemanas ?? "—"}</strong><br/>
                  Monto: <strong>${Number(monto||0).toFixed(2)}</strong><br/>
                </div>
              </div>
              <div className="p-3 border rounded-2">
                <div className="text-[12px] text-muted mb-1">Resumen neto</div>
                <div className="text-[13px]">
                  Cuota semanal: <strong>{(cuotaSemanal ?? 0) ? `$${cuotaSemanal!.toFixed(2)}` : "—"}</strong><br />
                  Papelería: <strong>${Number(papeleria||0).toFixed(2)}</strong><br />
                  Cartera vencida: <strong>${Number(adeudoCuotas||0).toFixed(2)}</strong><br />
                  M15: <strong>${Number(multaActiva||0).toFixed(2)}</strong><br />
                  <div className="mt-1 font-medium">Neto a entregar: ${Math.max(0, Number(monto||0)-Number(papeleria||0)-Number(adeudoCuotas||0)-Number(multaActiva||0)).toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="p-3 border rounded-2 bg-gray-50">
              <div className="text-[12px] text-muted mb-1">Fechas</div>
              <div className="text-[13px]">Primer pago: <strong>{fecha1 || "—"}</strong></div>
              <div className="text-[12px] text-muted mt-2">* Se generarán {planSemanas ?? 0} cuotas cada 7 días desde la fecha indicada.</div>
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-t flex justify-between gap-2">
          <div className="text-[12px] text-muted">
            {(!poblacion && titularSel) && "Asigna una población al titular para continuar."}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>Cancelar</button>
            <button className="btn-primary !h-8 !px-3 text-xs" onClick={guardar} disabled={!puedeGuardar}>
              <Save className="w-4 h-4" /> Crear crédito
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
