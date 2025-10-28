// src/pages/Creditos.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  MoreVertical,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  RefreshCcw,
} from "lucide-react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";

// Wizard
import CreditoWizard from "../components/CreditoWizard";

// Confirm
import useConfirm from "../components/Confirm";

// Servicios
import {
  getCreditosPaged,
  mostrarFolio,
  getAvanceFor,
  type CreditoRow,
} from "../services/creditos.service";

function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const s = d.slice(0, 10);
  return s || "—";
}

/* ===== Modal base ===== */
function ModalCard({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal">
      <div className={`modal-card ${wide ? "modal-card-lg" : ""}`}>
        <div className="modal-head">
          <div className="text-[13px] font-medium">{title}</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ===== Menú flotante ===== */
function MenuPortal({
  open,
  top,
  left,
  onClose,
  children,
}: {
  open: boolean;
  top: number;
  left: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onEsc);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onEsc);
      window.removeEventListener("click", close);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      style={{ position: "fixed", top, left, zIndex: 1000, minWidth: 220 }}
      className="bg-white border rounded-2 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

export default function Creditos() {
  // Tabla
  const [rows, setRows] = useState<CreditoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [search, setSearch] = useState("");

  // Avance
  const [avanceMap, setAvanceMap] = useState<Record<number, { pagadas: number; total: number }>>({});

  // Menú
  const [menuRowId, setMenuRowId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Modales
  const [viewRow, setViewRow] = useState<CreditoRow | null>(null);

  // Wizard
  const [openWizard, setOpenWizard] = useState(false);
  const [renOrigen, setRenOrigen] = useState<{ creditoId: number } | null>(null);

  // Confirm
  const [confirm, ConfirmUI] = useConfirm();

  // Paginación
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Carga (ADMIN ve TODO; CAPTURISTA ya viene filtrado desde el service)
  async function load() {
    const offset = (page - 1) * pageSize;
    const { rows, total } = await getCreditosPaged(offset, pageSize, search);

    // Avance real por ids
    const ids = rows.map((r) => r.id);
    const avance = await getAvanceFor(ids);
    setAvanceMap(avance);

    setRows(rows);
    setTotal(total);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search]);

  function titularDe(r: CreditoRow) {
    return r.sujeto === "CLIENTE" ? r.cliente?.nombre ?? "—" : r.coordinadora?.nombre ?? "—";
  }

  function avanceSemanas(r: CreditoRow) {
    const a = avanceMap[r.id] || { pagadas: 0, total: 0 };
    const totalCalc = a.total || (r as any).semanas || (r as any).semanas_plan || 0;
    return `${a.pagadas} de ${totalCalc}`;
  }

  function isRenovable(r: CreditoRow) {
    const a = avanceMap[r.id] || { pagadas: 0 };
    return (a.pagadas ?? 0) >= 10 && (r.estado || "").toUpperCase() === "ACTIVO";
  }

  function openVer(r: CreditoRow) {
    setViewRow(r);
  }

  function openMenu(e: React.MouseEvent, r: CreditoRow) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, left: rect.right - 220 });
    setMenuRowId(r.id);
    e.stopPropagation();
  }

  async function askDelete(r: CreditoRow) {
    const a = avanceMap[r.id] || { pagadas: 0 };
    if ((a.pagadas ?? 0) > 0) {
      await confirm({
        tone: "warn",
        title: "No se puede eliminar",
        message: "Solo se puede eliminar un crédito sin pagos.",
      });
      return;
    }
    const ok = await confirm({
      tone: "danger",
      title: "Eliminar crédito",
      message: (
        <>
          ¿Seguro que deseas eliminar el crédito <b>{mostrarFolio(r)}</b>? Esta acción no se puede
          deshacer.
        </>
      ) as any,
      confirmText: "Eliminar",
    });
    if (!ok) return;

    const { error } = await supabase.from("creditos").delete().eq("id", r.id);
    if (error) {
      await confirm({
        tone: "danger",
        title: "No se pudo eliminar",
        message: error.message || "El backend rechazó la eliminación.",
      });
      return;
    }
    await confirm({ title: "Eliminado", message: "El crédito fue eliminado correctamente." });
    setMenuRowId(null);
    await load();
  }

  function onRenovar(r: CreditoRow) {
    if (!isRenovable(r)) return;
    setRenOrigen({ creditoId: r.id });
    setOpenWizard(true);
  }

  return (
    <div className="dt__card">
      {ConfirmUI}

      {/* Toolbar */}
      <div className="dt__toolbar">
        <div className="dt__tools">
          <div className="relative">
            <input
              className="input dt__search--sm"
              placeholder="Buscar por folio externo o titular…"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted">Mostrar</span>
            <select
              className="input input--sm !w-20"
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(parseInt(e.target.value));
              }}
            >
              {[5, 8, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end">
            <button
              className="btn-primary btn--sm"
              onClick={async () => {
                setRenOrigen(null);
                setOpenWizard(true);
              }}
            >
              <Plus className="w-4 h-4" /> Crear crédito
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-frame overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-center">Folio</th>
              <th className="text-center">Titular</th>
              <th className="text-center">Sujeto</th>
              <th className="text-center">Semanas</th>
              <th className="text-center">Cuota</th>
              <th className="text-center">Monto</th>
              <th className="text-center">Estado</th>
              <th className="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[13px] text-muted">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const renovable = isRenovable(r);
                const a = avanceMap[r.id] || { pagadas: 0, total: 0 };
                const totalSem = a.total || (r as any).semanas || (r as any).semanas_plan || 0;
                return (
                  <tr key={r.id}>
                    <td className="text-[13px] text-center">{mostrarFolio(r)}</td>
                    <td className="text-[13px] text-center">{titularDe(r)}</td>
                    <td className="text-[13px] text-center">{r.sujeto}</td>
                    <td className="text-[13px] text-center">
                      {(a.pagadas ?? 0)} de {totalSem}
                    </td>
                    <td className="text-[13px] text-center">
                      {money((r as any).cuota ?? (r as any).cuota_semanal ?? 0)}
                    </td>
                    <td className="text-[13px] text-center">
                      {money((r as any).monto ?? (r as any).monto_principal ?? 0)}
                    </td>
                    <td className="text-[13px] text-center">
                      <span className="text-[var(--baci-blue)] font-medium">{r.estado || "—"}</span>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        <button className="btn-outline btn--sm" title="Ver" onClick={() => openVer(r)}>
                          <Eye className="w-4 h-4" /> Ver
                        </button>
                        <button
                          className={`btn--sm ${renovable ? "btn-primary" : "btn-outline text-gray-500"}`}
                          title={
                            renovable
                              ? "Renovar crédito"
                              : `Disponible desde la semana 10 (avance actual: ${a.pagadas} de ${totalSem})`
                          }
                          onClick={() => onRenovar(r)}
                        >
                          <RefreshCcw className="w-4 h-4" /> Renovar
                        </button>
                        <button
                          className="btn-outline btn--sm"
                          onClick={(e) => openMenu(e, r)}
                          title="Más"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer */}
        <div className="px-3 py-2 border-t flex items-center justify-between">
          <div className="text-[12.5px] text-muted">
            {total === 0 ? "0" : `${from}–${to}`} de {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-outline btn--sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
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
            <button
              className="btn-outline btn--sm"
              onClick={() => setPage(Math.min(pages, page + 1))}
              disabled={page >= pages}
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Menú (Eliminar) */}
      <MenuPortal open={!!menuRowId} top={menuPos.top} left={menuPos.left} onClose={() => setMenuRowId(null)}>
        {!!menuRowId && (
          <>
            <button
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 text-red-600 disabled:opacity-50"
              onClick={() => {
                const row = rows.find((r) => r.id === menuRowId)!;
                askDelete(row);
              }}
              title="Eliminar (solo sin pagos)"
            >
              <Trash2 className="w-4 h-4 inline mr-1" />
              Eliminar
            </button>
          </>
        )}
      </MenuPortal>

      {/* Ver */}
      {viewRow && (
        <ModalCard title="Resumen del crédito" onClose={() => setViewRow(null)}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="card p-3">
              <div className="text-[12px] text-muted">Folio</div>
              <div className="text-[13px] font-semibold">{mostrarFolio(viewRow)}</div>

              <div className="mt-2 text-[12px] text-muted">Titular</div>
              <div className="text-[13px] font-medium">
                {viewRow.sujeto === "CLIENTE" ? viewRow.cliente?.nombre ?? "—" : viewRow.coordinadora?.nombre ?? "—"}
              </div>

              <div className="mt-2 text-[12px] text-muted">Sujeto</div>
              <div className="text-[13px]">{viewRow.sujeto}</div>

              <div className="mt-2 text-[12px] text-muted">Estado</div>
              <div className="text-[13px]">{viewRow.estado}</div>
            </div>

            <div className="card p-3">
              <div className="text-[12px] text-muted">Monto</div>
              <div className="text-[13px] font-medium">
                {money((viewRow as any).monto_principal ?? (viewRow as any).monto ?? 0)}
              </div>

              <div className="mt-2 text-[12px] text-muted">Cuota semanal</div>
              <div className="text-[13px] font-medium">
                {money((viewRow as any).cuota_semanal ?? (viewRow as any).cuota ?? 0)}
              </div>

              <div className="mt-2 text-[12px] text-muted">Fecha de disposición</div>
              <div className="text-[13px]">
                {fmtDate((viewRow as any).fecha_disposicion ?? (viewRow as any).fecha_alta)}
              </div>
            </div>
          </div>
        </ModalCard>
      )}

      {/* Wizard (crear/renovar) */}
      {openWizard && (
        <ModalCard title={renOrigen ? "Renovar crédito" : "Crear crédito"} onClose={() => setOpenWizard(false)} wide>
          <CreditoWizard
            onClose={async (changed) => {
              setOpenWizard(false);
              if (changed) {
                setPage(1);
                await load();
              }
            }}
            origenRenovacion={renOrigen ?? undefined}
          />
        </ModalCard>
      )}
    </div>
  );
}
