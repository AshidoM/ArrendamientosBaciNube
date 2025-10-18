// src/components/DataTable.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";

type Column<RowT> = {
  key: string;
  header: string;
  /** Tailwind width classes para grid-col-span responsivo. Ej: "col-span-6 sm:col-span-6" */
  spanClass?: string;
  /** Ocultar en pantallas pequeñas */
  hiddenOnSm?: boolean;
  /** Render custom */
  render?: (row: RowT) => React.ReactNode;
  /** Selector por defecto si no hay render (row[col.key]) */
  accessor?: (row: RowT) => any;
};

type PrimaryAction<RowT> = {
  label: string | React.ReactNode;
  onClick: (row: RowT) => void;
  buttonClassName?: string; // por defecto btn-primary !h-8 !px-2 text-xs
  icon?: React.ReactNode;
};

type MenuAction<RowT> = {
  key: string;
  label: string | React.ReactNode;
  onClick: (row: RowT) => void;
  icon?: React.ReactNode;
};

type DataTableProps<RowT> = {
  rows?: RowT[];                           // ← puede venir undefined al inicio
  columns?: Column<RowT>[];                // ← igual
  getRowId: (row: RowT) => string;

  /** Acción primaria visible en cada fila (ej. Ver) */
  primaryAction?: PrimaryAction<RowT>;
  /** Acciones en menú de 3 puntos */
  menuActions?: MenuAction<RowT>[];

  /** Búsqueda */
  enableSearch?: boolean;
  searchPlaceholder?: string;
  /** Cómo formar el string de búsqueda por fila */
  searchText?: (row: RowT) => string;

  /** Adaptativo: calcula filas por página automáticamente según alto de ventana */
  autoRows?: boolean; // default true
  minRows?: number;   // default 5
  maxRows?: number;   // default 20
  rowHeight?: number; // default 56 (px aprox.)
  autoRowOffset?: number; // default 480 (alto “reservado” fuera de la tabla)

  /** Si prefieres controlar la paginación desde fuera, puedes pasar pageSize opcional */
  pageSize?: number;

  /** Textos/UI */
  emptyText?: string;
};

function DataTable<RowT>({
  rows: rowsProp = [],                 // defaults seguros
  columns: columnsProp = [],
  getRowId,
  primaryAction,
  menuActions = [],
  enableSearch = true,
  searchPlaceholder = "Buscar…",
  searchText = (r: any) => String(r ?? ""),
  autoRows = true,
  minRows = 5,
  maxRows = 20,
  rowHeight = 56,
  autoRowOffset = 480,
  pageSize,
  emptyText = "Sin resultados.",
}: DataTableProps<RowT>) {
  // clones inmutables por si vienen mutando desde arriba
  const rows = Array.isArray(rowsProp) ? rowsProp : [];
  const columns = Array.isArray(columnsProp) ? columnsProp : [];

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [autoPageSize, setAutoPageSize] = useState(calcRowsPerPage());

  const openMenuFor = useRef<string | null>(null);
  const [, force] = useState(0); // para cerrar menú al click externo

  function calcRowsPerPage() {
    if (!autoRows) return pageSize || minRows;
    const vh = (typeof window !== "undefined" ? window.innerHeight : 800) || 800;
    const available = Math.max(220, vh - autoRowOffset);
    const n = Math.floor(available / rowHeight);
    return Math.min(maxRows, Math.max(minRows, n));
  }

  useEffect(() => {
    const onResize = () => setAutoPageSize(calcRowsPerPage());
    const closeMenus = () => {
      if (openMenuFor.current !== null) {
        openMenuFor.current = null;
        force((v) => v + 1);
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("click", closeMenus);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("click", closeMenus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectivePageSize = pageSize ?? autoPageSize;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      try {
        return (searchText(r) || "").toString().toLowerCase().includes(q);
      } catch {
        return false;
      }
    });
  }, [rows, query, searchText]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, effectivePageSize)));
  const safePage = Math.min(totalPages, Math.max(1, page));

  useEffect(() => { setPage(1); }, [query, effectivePageSize, rows.length]);

  const start = (safePage - 1) * Math.max(1, effectivePageSize);
  const end = Math.min(total, start + Math.max(1, effectivePageSize));
  const pageRows = filtered.slice(start, end);

  function goto(p: number) {
    const n = Math.min(totalPages, Math.max(1, p));
    setPage(n);
  }

  return (
    <div className="grid gap-3">
      {/* Toolbar de búsqueda (sin ícono de lupa) */}
      {enableSearch && (
        <div className="relative w-full sm:max-w-xs mt-2">
          <input
            className="input"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
          />
        </div>
      )}

      {/* Tabla */}
      <div className="border rounded-2 overflow-visible">
        {/* Header */}
        <div className="grid grid-cols-12 px-3 py-2 text-[12px] text-muted border-b bg-gray-50">
          {columns.map((c) => (
            <div
              key={c.key}
              className={[
                c.spanClass ?? "col-span-6 sm:col-span-6",
                c.hiddenOnSm ? "hidden sm:block" : ""
              ].join(" ")}
            >
              {c.header}
            </div>
          ))}
          <div className="col-span-6 sm:col-span-1 text-right">Acciones</div>
        </div>

        {/* Body */}
        {pageRows.length === 0 ? (
          <div className="p-4 text-[13px] text-muted">{emptyText}</div>
        ) : (
          <ul className="divide-y">
            {pageRows.map((row, idx) => {
              const rid = getRowId(row);
              return (
                <li key={rid || idx} className="grid grid-cols-12 items-center px-3 py-2 relative">
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      className={[
                        c.spanClass ?? "col-span-6 sm:col-span-6",
                        c.hiddenOnSm ? "hidden sm:block" : "",
                        "min-w-0"
                      ].join(" ")}
                    >
                      <div className="truncate text-[13px]">
                        {c.render ? c.render(row) : String(c.accessor ? c.accessor(row) : (row as any)[c.key] ?? "")}
                      </div>
                    </div>
                  ))}

                  {/* Acciones */}
                  <div className="col-span-6 sm:col-span-1 flex justify-end gap-1 relative">
                    {primaryAction && (
                      <button
                        className={primaryAction.buttonClassName ?? "btn-primary !h-8 !px-2 text-xs"}
                        onClick={() => primaryAction.onClick(row)}
                      >
                        {primaryAction.icon}
                        {primaryAction.label}
                      </button>
                    )}

                    {menuActions.length > 0 && (
                      <button
                        className="btn-outline !h-8 !px-2 text-xs relative z-40"
                        onClick={(e) => {
                          e.stopPropagation();
                          openMenuFor.current = openMenuFor.current === rid ? null : rid;
                          force((v) => v + 1);
                        }}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {menuActions.length > 0 && openMenuFor.current === rid && (
                      <div
                        className="absolute right-0 top-9 z-50 w-44 rounded-2 border bg-white shadow-xl"
                        onClick={(e)=>e.stopPropagation()}
                      >
                        {menuActions.map((m) => (
                          <button
                            key={m.key}
                            className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50"
                            onClick={() => { m.onClick(row); openMenuFor.current = null; force((v)=>v+1); }}
                          >
                            {m.icon} {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer de paginación */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 border-t bg-white">
          <div className="text-[12px] text-muted">
            {total === 0 ? "0" : `${start + 1}–${end}`} de {total}
          </div>

          <div className="flex items-center gap-2">
            <button className="btn-outline !h-8 !px-2 text-xs" onClick={() => goto(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="text-[12px] text-muted">Página</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = Number((e.currentTarget.elements.namedItem("pagenum") as HTMLInputElement).value);
                if (!Number.isNaN(v)) goto(v);
              }}
              className="flex items-center gap-2"
            >
              <input name="pagenum" defaultValue={safePage} className="input !h-8 !w-16 text-center" />
              <div className="text-[12px] text-muted">de {totalPages}</div>
            </form>
            <button className="btn-outline !h-8 !px-2 text-xs" onClick={() => goto(page + 1)} disabled={page >= totalPages}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DataTable;
export { DataTable };
