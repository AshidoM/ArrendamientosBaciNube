// src/pages/PagosMultas.tsx
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  CreditoLite,
  BalanceCredito,
  getCreditoLite,
  getBalance,
  registrarPago,
  fechaDeSemana,
} from "../services/pagos.service";
import { createM15IfNotExists, getM15Activa, toggleM15 } from "../services/multas.service";

type Row = CreditoLite & {
  // datos dinámicos
  bal?: BalanceCredito;
  m15Activa?: boolean;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export default function PagosMultas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [search, setSearch] = useState("");

  // estado de UI por fila
  const [modo, setModo] = useState<Record<number, "SEMANAL" | "VENCIDA" | "ABONO">>({});
  const [abono, setAbono] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  async function fetchPage() {
    // Trae créditos activos (o todos si quieres) con paginación
    let q = supabase
      .from("creditos")
      .select(`
        id, folio, sujeto, semanas_plan, monto, cuota, primer_pago, fecha_alta, estado,
        cliente:clientes(nombre),
        coordinadora:coordinadoras(nombre)
      `, { count: "exact" })
      .neq("estado", "FINALIZADO")
      .order("fecha_alta", { ascending: false })
      .order("id", { ascending: false });

    const s = search.trim();
    if (s) {
      const n = Number(s);
      if (!Number.isNaN(n)) q = q.eq("folio", n);
    }

    const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) { console.error(error); return; }

    let base = (data || []).map((d: any) => {
      const titular = d.sujeto === "CLIENTE" ? (d.cliente?.nombre ?? "—") : (d.coordinadora?.nombre ?? "—");
      return {
        id: d.id, folio: d.folio, sujeto: d.sujeto, semanas_plan: d.semanas_plan,
        monto: d.monto, cuota: d.cuota, primer_pago: d.primer_pago, fecha_alta: d.fecha_alta,
        estado: d.estado, titular,
      } as Row;
    });

    if (s && Number.isNaN(Number(s))) {
      const sL = s.toLowerCase();
      base = base.filter(r => r.titular.toLowerCase().includes(sL));
    }

    // cargar balances + m15 en paralelo
    const enriched = await Promise.all(
      base.map(async (r) => {
        try {
          const [bal, m15] = await Promise.all([getBalance(r.id), getM15Activa(r.id)]);
          return { ...r, bal, m15Activa: !!m15 };
        } catch {
          return r;
        }
      })
    );

    setRows(enriched);
    setTotal(count || enriched.length);
  }

  useEffect(() => { fetchPage(); /* eslint-disable-next-line */ }, [page, pageSize, search]);

  async function onNoPago(creditoId: number) {
    setBusy(b => ({ ...b, [creditoId]: true }));
    try {
      await createM15IfNotExists(creditoId, "No pagó (botón)");
      await fetchPage();
      alert("M15 activada.");
    } catch (e: any) {
      alert(e?.message ?? "No se pudo activar la M15.");
    } finally {
      setBusy(b => ({ ...b, [creditoId]: false }));
    }
  }

  async function onToggleM15(creditoId: number) {
    setBusy(b => ({ ...b, [creditoId]: true }));
    try {
      const r = await toggleM15(creditoId);
      await fetchPage();
      alert(`M15 ${r.status.toLowerCase()}.`);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo cambiar la M15.");
    } finally {
      setBusy(b => ({ ...b, [creditoId]: false }));
    }
  }

  async function onRegistrarPago(r: Row) {
    setBusy(b => ({ ...b, [r.id]: true }));
    try {
      const m = modo[r.id] || (r.bal?.tiene_vencida ? "VENCIDA" : "SEMANAL");
      if (m === "ABONO") {
        const val = Number(abono[r.id] || "0");
        if (!val || val <= 0) {
          alert("Indica un monto válido para abono.");
          setBusy(b => ({ ...b, [r.id]: false }));
          return;
        }
        await registrarPago(r.id, { modo: "ABONO", monto: val });
      } else if (m === "VENCIDA") {
        await registrarPago(r.id, { modo: "VENCIDA" });
      } else {
        await registrarPago(r.id, { modo: "SEMANAL" });
      }
      await fetchPage();
      setAbono(a => ({ ...a, [r.id]: "" }));
      alert("Pago registrado.");
    } catch (e: any) {
      alert(e?.message ?? "No se pudo registrar el pago.");
    } finally {
      setBusy(b => ({ ...b, [r.id]: false }));
    }
  }

  return (
    <div className="dt__card">
      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="relative">
            <input
              className="input dt__search--sm"
              placeholder="Buscar por folio o titular…"
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted">Mostrar</span>
            <select
              className="input input--sm !w-20"
              value={pageSize}
              onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value)); }}
            >
              {[5, 8, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div />
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-center">Crédito</th>
              <th className="text-center">Cliente</th>
              <th className="text-center">Monto total</th>
              <th className="text-center">Adeudo total</th>
              <th className="text-center">Cuota semanal</th>
              <th className="text-center">Cuota vencida</th>
              <th className="text-center">Semanas restantes</th>
              <th className="text-center">Pagos</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[13px] text-muted">Sin resultados.</td>
              </tr>
            ) : rows.map(r => {
              const bal = r.bal;
              const tieneVencida = !!bal?.tiene_vencida;
              const semanaActual = bal?.semana_proxima ?? 1;
              const fechaActual = bal ? fechaDeSemana(r.primer_pago, semanaActual) : r.primer_pago;

              // defaults UI
              const uiModo = modo[r.id] || (tieneVencida ? "VENCIDA" : "SEMANAL");
              const abonoVal = abono[r.id] ?? "";

              return (
                <tr key={r.id}>
                  <td className="text-[13px] text-center">#{r.folio}</td>
                  <td className="text-[13px] text-center">{r.titular}</td>
                  <td className="text-[13px] text-center">{money(r.monto)}</td>
                  <td className="text-[13px] text-center">{money(bal?.adeudo_total ?? r.cuota * r.semanas_plan)}</td>
                  <td className="text-[13px] text-center">{money(r.cuota)}</td>
                  <td className="text-[13px] text-center">{tieneVencida ? money(bal?.vencida_monto ?? r.cuota) : "$0.00"}</td>
                  <td className="text-[13px] text-center">{bal?.semanas_restantes ?? r.semanas_plan}</td>

                  <td className="text-[13px]">
                    <div className="grid gap-2 justify-items-center">
                      {/* Indicadores */}
                      {bal && (
                        <div className="text-[12px] text-muted">
                          Próx. pago: <b>Semana {semanaActual}</b> ({fechaActual})
                        </div>
                      )}

                      {/* Checkboxes */}
                      <div className="flex items-center gap-2">
                        <label className="text-[12.5px]">
                          <input
                            type="radio"
                            name={`modo-${r.id}`}
                            checked={uiModo === "VENCIDA"}
                            onChange={() => setModo(m => ({ ...m, [r.id]: "VENCIDA" }))}
                            disabled={!tieneVencida}
                          />{" "}
                          Cuota vencida
                        </label>
                        <label className="text-[12.5px]">
                          <input
                            type="radio"
                            name={`modo-${r.id}`}
                            checked={uiModo === "SEMANAL"}
                            onChange={() => setModo(m => ({ ...m, [r.id]: "SEMANAL" }))}
                            disabled={tieneVencida}
                          />{" "}
                          Cuota semanal
                        </label>
                        <label className="text-[12.5px]">
                          <input
                            type="radio"
                            name={`modo-${r.id}`}
                            checked={uiModo === "ABONO"}
                            onChange={() => setModo(m => ({ ...m, [r.id]: "ABONO" }))}
                            disabled={tieneVencida}
                          />{" "}
                          Abono
                        </label>
                      </div>

                      {/* Campo abono */}
                      <div className="flex items-center gap-2">
                        <input
                          className="input input--sm !w-28 text-right"
                          placeholder="$ Monto"
                          value={abonoVal}
                          onChange={(e) => setAbono(a => ({ ...a, [r.id]: e.target.value }))}
                          disabled={uiModo !== "ABONO" || busy[r.id]}
                        />
                      </div>

                      {/* Botones */}
                      <div className="flex items-center gap-2">
                        <button
                          className="btn-outline btn--sm"
                          onClick={() => onNoPago(r.id)}
                          disabled={busy[r.id]}
                          title="Marca no pagó y activa M15 si no existe"
                        >
                          <AlertTriangle className="w-4 h-4" /> No pagó
                        </button>

                        <button
                          className="btn-primary btn--sm"
                          onClick={() => onRegistrarPago(r)}
                          disabled={busy[r.id]}
                        >
                          Registrar pago
                        </button>
                      </div>

                      {/* Estado M15 + toggle (para corrección de captura) */}
                      <div className="text-[12px]">
                        M15:{" "}
                        <b className={r.m15Activa ? "text-red-600" : "text-muted"}>
                          {r.m15Activa ? "Activa" : "No activa"}
                        </b>{" "}
                        <button
                          className="btn-ghost !h-6 !px-2 text-xs"
                          onClick={() => onToggleM15(r.id)}
                          disabled={busy[r.id]}
                          title="Activar/Desactivar M15 manualmente"
                        >
                          cambiar
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div className="px-3 py-2 border-t flex items-center justify-between">
          <div className="text-[12.5px] text-muted">{total === 0 ? "0" : `${from}–${to}`} de {total}</div>
          <div className="flex items-center gap-2">
            <button className="btn-outline btn--sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="text-[12.5px]">Página</div>
            <input
              className="input input--sm !w-16 text-center"
              value={page}
              onChange={(e) => {
                const v = parseInt(e.target.value || "1", 10);
                if (!Number.isNaN(v)) setPage(Math.min(Math.max(1, v), pages));
              }}
            />
            <div className="text-[12.5px]">de {pages}</div>
            <button className="btn-outline btn--sm" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
