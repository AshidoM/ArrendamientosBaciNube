// src/pages/Home.tsx
import { useEffect, useMemo, useState } from "react";
import { getUser, type AppUser } from "../auth";
import { useNavigate } from "react-router-dom";
import ReactApexChart from "react-apexcharts";
import { supabase } from "../lib/supabase";

import {
  monthBounds,
  daysBetweenInclusive,
  getAdeudoTotal,
  getAdeudoPorCredito,
  getCreditosCounts,
  getCreditosSplitPorSujeto,
  getRenovablesList,
  getCatalogCounts,
  getCuotaPorFecha,
  type RenovableLite,
  type AdeudoCreditoRow,
} from "../services/dashboard.service";

import { RefreshCcw, Layers, Database, Users2, CreditCard, List, ArrowRight } from "lucide-react";

/* ===== Helpers ===== */
function money(n: number) {
  const v = Math.round(Number(n || 0));
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `$${v}`;
  }
}
function useThemeColors() {
  const [c, setC] = useState({
    blue: "#007acc",
    gray: "#6b7280",
    grid: "rgba(0,0,0,0.08)",
  });
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setC((p) => ({
      ...p,
      blue: cs.getPropertyValue("--baci-blue")?.trim() || p.blue,
      gray: cs.getPropertyValue("--baci-muted")?.trim() || p.gray,
    }));
  }, []);
  return c;
}

type DOW = "LUNES" | "MARTES" | "MIERCOLES" | "JUEVES" | "VIERNES" | "SABADO" | "DOMINGO";
const DOWS: DOW[] = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
function nextDateForDOW(dow: DOW, from = new Date()): string {
  const map: Record<DOW, number> = {
    LUNES: 1,
    MARTES: 2,
    MIERCOLES: 3,
    JUEVES: 4,
    VIERNES: 5,
    SABADO: 6,
    DOMINGO: 0,
  };
  const want = map[dow];
  const d = new Date(from);
  const cur = d.getDay();
  const add = (want - cur + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

/* ===== Paginación helper (cliente) ===== */
function usePager<T>(rows: T[], size = 5) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil((rows?.length || 0) / size));
  const data = useMemo(() => {
    const start = (page - 1) * size;
    return rows.slice(start, start + size);
  }, [rows, page, size]);
  useEffect(() => {
    if (page > pages) setPage(1);
  }, [pages]);
  return { page, setPage, pages, data, size };
}

/* ===== Tipos locales para pagos ===== */
type PagoRow = { credito_id: number; fecha: string; monto: number };
type Serie = { name: string; data: number[] };

/* =========================
   Componente
========================= */
export default function Home() {
  const nav = useNavigate();
  const [me, setMe] = useState<AppUser | null>(null);
  const theme = useThemeColors();
  useEffect(() => {
    setMe(getUser());
  }, []);

  // Filtro maestro (periodo)
  const month = monthBounds(new Date());
  const [fechaIni, setFechaIni] = useState(month.start);
  const [fechaFin, setFechaFin] = useState(month.end);
  const [dias, setDias] = useState<string[]>(month.days); // eje X visible

  // KPIs
  const [adeudo, setAdeudo] = useState(0);
  const [activos, setActivos] = useState(0);
  const [finalizados, setFinalizados] = useState(0);
  const [totalCred, setTotalCred] = useState(0);
  const [porEstado, setPorEstado] = useState<{ estado: string; count: number }[]>([]);
  const [split, setSplit] = useState<{ cliente: number; coordinadora: number; total: number }>({
    cliente: 0,
    coordinadora: 0,
    total: 0,
  });

  // Series de PAGOS por crédito (gráfico)
  const [seriesPagos, setSeriesPagos] = useState<Serie[]>([]);

  // Renovables
  const [renCount, setRenCount] = useState(0);
  const [renOpen, setRenOpen] = useState(false);
  const [renList, setRenList] = useState<RenovableLite[]>([]);
  const renPager = usePager(renList, 5);
  const [renFilter, setRenFilter] = useState<"TODOS" | "CLIENTE" | "COORDINADORA">("TODOS");

  // Adeudo (modal)
  const [adeudoOpen, setAdeudoOpen] = useState(false);
  const [adeudoList, setAdeudoList] = useState<AdeudoCreditoRow[]>([]);
  const adePager = usePager(adeudoList, 5);

  // Catálogos
  const [cats, setCats] = useState({
    clientes: 0,
    coordinadoras: 0,
    avales: 0,
    operadores: 0,
    poblaciones: 0,
    rutas: 0,
    usuarios: 0,
  });

  // Cuota del día (selector)
  const [dow, setDow] = useState<DOW>("LUNES");
  const [cuotaDia, setCuotaDia] = useState<{ fecha: string; total: number }>({
    fecha: nextDateForDOW("LUNES"),
    total: 0,
  });

  const [loading, setLoading] = useState(true);

  // ====== Carga todo
  async function loadAll(rangeStart: string, rangeEnd: string) {
    setLoading(true);
    try {
      const rangeDays = daysBetweenInclusive(rangeStart, rangeEnd);

      const [adeudoV, cCounts, splitV, catsV, renListV] = await Promise.all([
        getAdeudoTotal(),
        getCreditosCounts(),
        getCreditosSplitPorSujeto(),
        getCatalogCounts(),
        getRenovablesList(),
      ]);

      setDias(rangeDays);
      setAdeudo(adeudoV);
      setActivos(cCounts.activos);
      setFinalizados(cCounts.finalizados);
      setTotalCred(cCounts.total);
      setPorEstado(cCounts.porEstado);
      setSplit(splitV);
      setCats(catsV);

      setRenList(renListV);
      setRenCount(renListV.length);

      // ==== Pagos por crédito (series)
      const pagos = await fetchPagos(rangeStart, rangeEnd);
      const series = await buildSeriesPorCredito(rangeDays, pagos);
      setSeriesPagos(series);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(fechaIni, fechaFin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Pagos (consulta robusta)
  async function fetchPagos(startISO: string, endISO: string): Promise<PagoRow[]> {
    // 1) Vista preferente
    try {
      const { data, error } = await supabase
        .from("vw_creditos_pagos")
        .select("credito_id, fecha, monto")
        .gte("fecha", startISO)
        .lte("fecha", endISO);
      if (error) throw error;
      const rows: PagoRow[] = (data || []).map((r: any) => ({
        credito_id: Number(r.credito_id),
        fecha: typeof r.fecha === "string" ? r.fecha.slice(0, 10) : new Date(r.fecha).toISOString().slice(0, 10),
        monto: Number(r.monto || 0),
      }));
      if (rows.length || data) return rows;
    } catch {
      /* fallback */
    }
    // 2) Fallback a tabla pagos
    try {
      const { data, error } = await supabase
        .from("pagos")
        .select("credito_id, fecha, total, monto, importe")
        .gte("fecha", startISO)
        .lte("fecha", endISO);
      if (error) throw error;
      const rows: PagoRow[] = (data || []).map((r: any) => ({
        credito_id: Number(r.credito_id),
        fecha: typeof r.fecha === "string" ? r.fecha.slice(0, 10) : new Date(r.fecha).toISOString().slice(0, 10),
        monto: Number(r.total ?? r.monto ?? r.importe ?? 0),
      }));
      return rows;
    } catch {
      return [];
    }
  }

  // ===== Construye series por crédito
  async function buildSeriesPorCredito(daysISO: string[], pagos: PagoRow[]): Promise<Serie[]> {
    if (!pagos.length) return [];
    const ids = Array.from(new Set(pagos.map((p) => p.credito_id)));
    let names = new Map<number, string>();
    try {
      const { data } = await supabase.from("creditos").select("id, folio_publico").in("id", ids);
      names = new Map<number, string>((data || []).map((c: any) => [c.id, String(c.folio_publico || `CR-${c.id}`)]));
    } catch {
      ids.forEach((id) => names.set(id, `CR-${id}`));
    }

    const byCred: Map<number, Map<string, number>> = new Map();
    for (const p of pagos) {
      if (!byCred.has(p.credito_id)) byCred.set(p.credito_id, new Map());
      const m = byCred.get(p.credito_id)!;
      m.set(p.fecha, (m.get(p.fecha) || 0) + Math.round(p.monto || 0));
    }

    const out: Serie[] = [];
    for (const id of byCred.keys()) {
      const perDate = byCred.get(id)!;
      const data = daysISO.map((d) => perDate.get(d) || 0);
      out.push({ name: names.get(id) || `CR-${id}`, data });
    }
    return out;
  }

  // ===== Chart de pagos por crédito
  const chartPagos = useMemo(() => {
    const cats = dias.map((d) => String(parseInt(d.slice(8, 10), 10)));
    return {
      series: seriesPagos,
      options: {
        chart: { type: "line", toolbar: { show: true }, foreColor: theme.gray, animations: { enabled: true } },
        stroke: { curve: "smooth", width: 2 },
        markers: { size: 0 },
        dataLabels: { enabled: false },
        grid: { strokeDashArray: 3, borderColor: theme.grid },
        xaxis: { categories: cats, labels: { show: true } },
        yaxis: {
          min: 0,
          tickAmount: 5,
          labels: { formatter: (v: number) => money(v as any) },
        },
        tooltip: { y: { formatter: (v: number) => money(v as any) } },
        legend: { position: "top" },
      } as ApexCharts.ApexOptions,
    };
  }, [dias, seriesPagos, theme]);

  // Cuota del día
  async function refreshCuotaDay(newDow: DOW) {
    const fecha = nextDateForDOW(newDow);
    const res = await getCuotaPorFecha(fecha);
    setCuotaDia(res);
  }
  useEffect(() => {
    refreshCuotaDay(dow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Renovables
  async function openRenovables() {
    const list = await getRenovablesList();
    setRenList(list);
    renPager.setPage(1);
    setRenOpen(true);
  }
  const renFiltrados = useMemo(() => {
    if (renFilter === "TODOS") return renList;
    return renList.filter((r) => r.sujeto === renFilter);
  }, [renList, renFilter]);
  useEffect(() => {
    renPager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renFilter]);

  function goToCredito(id: number) {
    try {
      sessionStorage.setItem("creditos.autofilter", JSON.stringify({ id, ts: Date.now() }));
    } catch {}
    nav(`/creditos?id=${id}&autofilter=1`);
  }

  async function onActualizarRango() {
    await loadAll(fechaIni, fechaFin);
  }

  return (
    <div className="p-3 sm:p-4 grid gap-3">
      {/* Header + Filtro maestro */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-[18px] font-semibold">Inicio</h1>
          <p className="text-[13px]" style={{ color: "var(--baci-muted)" }}>
            {me ? `Bienvenido, ${me.username}` : "Sesión no detectada"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12.5px]">De</label>
          <input
            className="input input--sm"
            type="date"
            value={fechaIni}
            onChange={(e) => setFechaIni(e.target.value)}
          />
          <label className="text-[12.5px]">a</label>
          <input
            className="input input--sm"
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
          />
          <button className="btn-primary btn--sm" onClick={onActualizarRango} title="Actualizar rango">
            <RefreshCcw className="w-4 h-4" /> Actualizar
          </button>
        </div>
      </div>

      {/* Tarjetas compactas */}
      <div className="grid gap-3 xl:grid-cols-4 sm:grid-cols-2">
        {/* Adeudo total */}
        <div
          className="card p-3 hover:shadow cursor-pointer transition"
          onClick={async () => {
            setAdeudoOpen(true);
            const list = await getAdeudoPorCredito();
            setAdeudoList(list);
            adePager.setPage(1);
          }}
        >
          <div className="text-[12px] text-muted flex items-center gap-1">
            <Database className="w-4 h-4" /> Adeudo total (clic para ver)
          </div>
          <div className="text-[20px] font-semibold">{money(adeudo)}</div>
          <div className="text-[11.5px] text-muted">Detalle por crédito en modal</div>
        </div>

        {/* Créditos */}
        <div className="card p-3">
          <div className="text-[12px] text-muted flex items-center gap-1">
            <CreditCard className="w-4 h-4" /> Créditos
          </div>
          <div className="text-[14px] grid grid-cols-3 gap-2">
            <div>
              <div className="text-muted text-[12px]">Activos</div>
              <div className="font-semibold">{activos}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Finalizados</div>
              <div className="font-semibold">{finalizados}</div>
            </div>
            <div>
              <div className="text-muted text-[12px]">Total</div>
              <div className="font-semibold">{totalCred}</div>
            </div>
          </div>
          <div className="mt-2" style={{ height: 120 }}>
            <ReactApexChart
              options={{
                chart: { type: "bar", toolbar: { show: false }, foreColor: theme.gray, height: 120 },
                plotOptions: { bar: { columnWidth: "42%", borderRadius: 3 } },
                dataLabels: { enabled: false },
                colors: [theme.blue],
                xaxis: { categories: ["CLIENTE", "COORD"] },
                yaxis: { labels: { show: false } },
                grid: { show: false },
                tooltip: { y: { formatter: (v: number) => String(v) } },
              }}
              series={[{ name: "Créditos", data: [split.cliente, split.coordinadora] }]}
              type="bar"
              height={120}
            />
          </div>
        </div>

        {/* Renovables */}
        <div className="card p-3">
          <div className="flex items-center justify-between">
            <div className="text-[12px] text-muted flex items-center gap-1">
              <Layers className="w-4 h-4" /> Renovables
            </div>
            <button className="btn-outline btn--sm" onClick={openRenovables} title="Ver lista de renovables">
              <List className="w-4 h-4" /> Ver lista
            </button>
          </div>
          <div className="text-[20px] font-semibold mt-1">{renCount}</div>
          <div className="text-[11.5px] text-muted">Elegibles (≥ 10 semanas pagadas)</div>
        </div>

        {/* Catálogos */}
        <div className="card p-3">
          <div className="text-[12px] text-muted flex items-center gap-1">
            <Users2 className="w-4 h-4" /> Catálogos
          </div>
          <div className="grid grid-cols-2 gap-2 text-[13px] mt-1">
            <div>
              <span className="text-muted">Clientes</span>
              <div className="font-semibold">{cats.clientes}</div>
            </div>
            <div>
              <span className="text-muted">Coordinadoras</span>
              <div className="font-semibold">{cats.coordinadoras}</div>
            </div>
            <div>
              <span className="text-muted">Avales</span>
              <div className="font-semibold">{cats.avales}</div>
            </div>
            <div>
              <span className="text-muted">Operadores</span>
              <div className="font-semibold">{cats.operadores}</div>
            </div>
            <div>
              <span className="text-muted">Poblaciones</span>
              <div className="font-semibold">{cats.poblaciones}</div>
            </div>
            <div>
              <span className="text-muted">Rutas</span>
              <div className="font-semibold">{cats.rutas}</div>
            </div>
            <div className="col-span-2">
              <span className="text-muted">Usuarios</span>
              <div className="font-semibold">{cats.usuarios}</div>
            </div>
          </div>
        </div>
      </div>

      {/* PAGOS por crédito/semana (líneas múltiples) */}
      <div className="card p-3">
        <div className="text-[12px] text-muted mb-1">Pagos por crédito (diarios en el periodo)</div>
        <div style={{ width: "100%", height: 260 }}>
          <ReactApexChart options={chartPagos.options} series={chartPagos.series} type="line" height={260} />
        </div>
      </div>

      {/* Doble columna: Créditos por estado + Cuota del día */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-3">
          <div className="text-[12px] text-muted mb-1">Créditos por estado</div>
          <div style={{ width: "100%", height: 160 }}>
            <ReactApexChart
              options={{
                chart: { type: "bar", toolbar: { show: false }, foreColor: theme.gray, height: 140 },
                plotOptions: { bar: { columnWidth: "55%", borderRadius: 2, distributed: true } },
                dataLabels: { enabled: false },
                colors: (porEstado.map((r) =>
                  r.estado === "ACTIVO" ? "#16a34a" : r.estado === "FINALIZADO" ? "#ef4444" : "#f59e0b"
                ) as string[]),
                xaxis: { categories: porEstado.map((r) => r.estado), labels: { rotate: -15 } },
                yaxis: { labels: { show: false } },
                grid: { show: false },
                tooltip: { y: { formatter: (v: number) => String(v) } },
              }}
              series={[{ name: "Créditos", data: porEstado.map((r) => r.count) }]}
              type="bar"
              height={160}
            />
          </div>
        </div>

        <div className="card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] text-muted">Cuota del día (próxima fecha)</div>
            <div className="flex items-center gap-2">
              <select
                className="input input--sm"
                value={dow}
                onChange={async (e) => {
                  const d = e.target.value as DOW;
                  setDow(d);
                  await refreshCuotaDay(d);
                }}
                title="Selecciona el día"
              >
                {DOWS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button className="btn-outline btn--sm" onClick={() => refreshCuotaDay(dow)}>
                <RefreshCcw className="w-4 h-4" /> Recalcular
              </button>
            </div>
          </div>
          <div className="mt-2 text-[13px]">
            Fecha próxima: <b>{cuotaDia.fecha}</b>{" "}
            <ArrowRight className="inline w-4 h-4 mx-1" /> Total pendiente: <b>{money(cuotaDia.total)}</b>
          </div>
          <div className="text-[11.5px] text-muted">Suma de cuotas no pagadas programadas exactamente ese día.</div>
        </div>
      </div>

      {loading && (
        <div className="fixed bottom-3 right-3 px-3 py-2 text-[12.5px] bg-white border rounded shadow">Actualizando…</div>
      )}

      {/* Modal Renovables */}
      {renOpen && (
        <div className="modal">
          <div className="modal-card modal-card-lg">
            <div className="modal-head">
              <div className="text-[13px] font-medium flex items-center gap-2">
                <Layers className="w-4 h-4" /> Créditos renovables
              </div>
              <button className="btn-ghost btn--sm" onClick={() => setRenOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="p-3 grid gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted">Filtrar:</span>
                <select
                  className="input input--sm"
                  value={renFilter}
                  onChange={(e) => setRenFilter(e.target.value as any)}
                >
                  <option value="TODOS">Todos</option>
                  <option value="CLIENTE">Cliente</option>
                  <option value="COORDINADORA">Coordinadora</option>
                </select>
                <button className="btn-outline btn--sm" onClick={openRenovables}>
                  <RefreshCcw className="w-4 h-4" /> Refrescar
                </button>
              </div>

              <div className="table-frame overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Sujeto</th>
                      <th>Titular</th>
                      <th>Sem. plan</th>
                      <th>Sem. pagadas</th>
                      <th>Cuota</th>
                      <th>Primer pago</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center text-muted py-3">
                          Sin resultados.
                        </td>
                      </tr>
                    ) : (
                      renPager.data.map((r) => (
                        <tr key={r.id}>
                          <td className="text-center">{r.folio}</td>
                          <td className="text-center">{r.sujeto}</td>
                          <td className="truncate max-w-[280px]">{r.titular}</td>
                          <td className="text-center">{r.semanas_plan}</td>
                          <td className="text-center">{r.semanas_pagadas}</td>
                          <td className="text-center">{money(r.cuota)}</td>
                          <td className="text-center">{r.primer_pago || "—"}</td>
                          <td className="text-center">
                            <button className="btn-primary btn--sm" onClick={() => goToCredito(r.id)}>
                              Ir al crédito
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <div className="dt__footer">
                <div className="text-[12.5px] text-muted">
                  Página {renPager.page} de {renPager.pages} — Mostrando {renPager.data.length} de {renFiltrados.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="pager-btn"
                    disabled={renPager.page <= 1}
                    onClick={() => renPager.setPage(renPager.page - 1)}
                  >
                    ‹
                  </button>
                  <input
                    className="input input--xs input--pager"
                    value={renPager.page}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(Number(e.target.value || 1), renPager.pages));
                      renPager.setPage(n);
                    }}
                  />
                  <button
                    className="pager-btn"
                    disabled={renPager.page >= renPager.pages}
                    onClick={() => renPager.setPage(renPager.page + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adeudo por crédito */}
      {adeudoOpen && (
        <div className="modal">
          <div className="modal-card modal-card-lg">
            <div className="modal-head">
              <div className="text-[13px] font-medium flex items-center gap-2">
                <Database className="w-4 h-4" /> Adeudo por crédito
              </div>
              <button className="btn-ghost btn--sm" onClick={() => setAdeudoOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="p-3 grid gap-3">
              <div className="table-frame overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Sujeto</th>
                      <th>Titular</th>
                      <th className="text-right">Adeudo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adePager.data.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-muted py-3">
                          Sin datos.
                        </td>
                      </tr>
                    ) : (
                      adePager.data.map((r) => (
                        <tr key={r.id}>
                          <td className="text-center">{r.folio}</td>
                          <td className="text-center">{r.sujeto}</td>
                          <td className="truncate max-w-[280px]">{r.titular}</td>
                          <td className="text-right">{money(r.adeudo)}</td>
                          <td className="text-center">
                            <button className="btn-primary btn--sm" onClick={() => goToCredito(r.id)}>
                              Ir al crédito
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <div className="dt__footer">
                <div className="text-[12.5px] text-muted">
                  Página {adePager.page} de {adePager.pages} — Mostrando {adePager.data.length} de {adeudoList.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="pager-btn"
                    disabled={adePager.page <= 1}
                    onClick={() => adePager.setPage(adePager.page - 1)}
                  >
                    ‹
                  </button>
                  <input
                    className="input input--xs input--pager"
                    value={adePager.page}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(Number(e.target.value || 1), adePager.pages));
                      adePager.setPage(n);
                    }}
                  />
                  <button
                    className="pager-btn"
                    disabled={adePager.page >= adePager.pages}
                    onClick={() => adePager.setPage(adePager.page + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
