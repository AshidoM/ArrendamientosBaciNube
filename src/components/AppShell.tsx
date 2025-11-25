import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Route as RouteIcon, Users, UserCheck, UserCog,
  Landmark, FileStack, CircleDollarSign, FileChartColumn,
  Settings, LogOut, User, ChevronDown, FileSpreadsheet, X, CheckSquare, Square, Calculator
} from "lucide-react";
import { getUser, logout, type AppUser } from "../auth";
import { getPublicUrl } from "../lib/storage";

/* Wizard final */
import ImportWizardModal from "./ImportWizardModal";
import { buildStaging, type StageWorkbook } from "../services/import/staging";

/* Selector inline mínimo */
import * as XLSX from "xlsx";

type Item = {
  key: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Array<AppUser["rol"]>;
};

function Avatar({ name, src }: { name?: string | null; src?: string | null }) {
  const initial = (name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="relative w-8 h-8 rounded-full overflow-hidden">
      {src ? (
        <img src={src} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center bg-[color-mix(in_oklab,var(--baci-blue),white_75%)] text-[color-mix(in_oklab,var(--baci-blue),black_10%)] text-[13px]">
          {initial}
        </div>
      )}
    </div>
  );
}

/* ========== Selector inline ========== */
function InlineImportDialog({
  open,
  onClose,
  onParsed,
}: {
  open: boolean;
  onClose: () => void;
  onParsed: (wb: { fileName: string }, selected: Array<{ name: string; ws: XLSX.WorkSheet }>) => void;
}) {
  const [fileName, setFileName] = useState<string>("");
  const [sheets, setSheets] = useState<Array<{ name: string; ws: XLSX.WorkSheet; rows: number }>>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
    const arr: Array<{ name: string; ws: XLSX.WorkSheet; rows: number }> = [];
    wb.SheetNames.forEach((name) => {
      const ws = wb.Sheets[name];
      const ref = (ws && (ws as any)["!ref"]) || "A1:A1";
      const rng = XLSX.utils.decode_range(ref);
      const rows = rng.e.r + 1;
      arr.push({ name, ws, rows });
    });
    setSheets(arr);
    const sel: Record<string, boolean> = {};
    arr.forEach(s => (sel[s.name] = true));
    setSelected(sel);
  }

  function toggleOne(name: string) {
    setSelected((s) => ({ ...s, [name]: !s[name] }));
  }

  function markAll(v: boolean) {
    const n: Record<string, boolean> = {};
    sheets.forEach(s => (n[s.name] = v));
    setSelected(n);
  }

  function continueParsed() {
    const picked = sheets.filter(s => selected[s.name]).map(s => ({ name: s.name, ws: s.ws }));
    if (picked.length === 0) return;
    onParsed({ fileName }, picked);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10040] grid place-items-center bg-black/50">
      <div className="w-[96vw] max-w-[1000px] max-h-[92vh] bg-white rounded-2 border shadow-xl overflow-hidden">
        <div className="h-12 px-3 border-b flex items-center justify-between">
          <div className="text-[13px] font-semibold">Seleccionar hojas a importar</div>
          <button className="btn-ghost !h-8 !px-3 text-xs" onClick={onClose}>
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>
        <div className="p-3 space-y-3 overflow-auto">
          <div className="flex items-center gap-3">
            <label className="btn-outline !h-9 !px-3 text-xs cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handlePick}
              />
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Elegir XLSX/CSV
            </label>
            <div className="text-[13px]">{fileName ? <>Archivo: <b>{fileName}</b></> : "Sin archivo"}</div>
          </div>

          {sheets.length > 0 && (
            <div className="flex items-center justify-end gap-4 text-[13px]">
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => markAll(true)}>Marcar todas</button>
              <button className="btn-ghost !h-8 !px-3 text-xs" onClick={() => markAll(false)}>Desmarcar</button>
            </div>
          )}

          {sheets.length > 0 && (
            <div className="border rounded-2 overflow-hidden">
              {sheets.map(s => (
                <div key={s.name} className="flex items-center justify-between px-3 py-3 border-b last:border-b-0">
                  <button
                    className="flex items-center gap-2"
                    onClick={() => toggleOne(s.name)}
                  >
                    {selected[s.name] ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    <span className="text-[13px] font-medium">{s.name}</span>
                  </button>
                  <div className="text-[12px] opacity-70">{s.rows} filas</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-3 border-t flex items-center justify-between">
          <div className="text-[12.5px]">
            <span className="mr-3">✔ Duplicados se omiten por INE o por nombre</span>
            <span className="mr-3">⚠ Créditos de “Coordinadora” se etiquetan por coincidencia de nombre</span>
          </div>
          <button
            className="btn-primary !h-9 !px-4 text-xs disabled:opacity-60"
            disabled={!fileName || sheets.every(s => !selected[s.name])}
            onClick={continueParsed}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================ AppShell ================ */
export default function AppShell({ children }: PropsWithChildren) {
  const nav = useNavigate();
  const loc = useLocation();
  const [me, setMe] = useState<AppUser | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [menuUser, setMenuUser] = useState(false);

  // Importación
  const [openImportSelector, setOpenImportSelector] = useState(false);
  const [openImportWizard, setOpenImportWizard] = useState(false);
  const [staging, setStaging] = useState<StageWorkbook | null>(null);

  // Progreso (lectura/parseo)
  const [progOpen, setProgOpen] = useState(false);
  const [prog, setProg] = useState(0);
  const [progLabel, setProgLabel] = useState<string>("");

  const SIDEBAR_W_OPEN = 240;
  const SIDEBAR_W_CLOSED = 64;
  const HEADER_H = 56;

  useEffect(() => {
    const u = getUser();
    setMe(u || null);
    setPhoto(u?.foto_url ? getPublicUrl(u.foto_url) : null);
    const handler = () => {
      const nu = getUser();
      setMe(nu || null);
      setPhoto(nu?.foto_url ? getPublicUrl(nu.foto_url) : null);
    };
    window.addEventListener("baci_profile_updated", handler);
    return () => window.removeEventListener("baci_profile_updated", handler);
  }, []);

  useEffect(() => { setMenuUser(false); }, [loc.pathname]);

  const items: Item[] = useMemo(
    () => [
      { key: "home", label: "Inicio", to: "/", icon: LayoutDashboard },
      { key: "rutas", label: "Rutas y Poblaciones", to: "/rutas", icon: RouteIcon },
      { key: "clientes", label: "Clientes y Avales", to: "/clientes", icon: Users },
      { key: "coordinadoras", label: "Coordinadoras", to: "/coordinadoras", icon: UserCheck },
      { key: "operadores", label: "Operadores", to: "/operadores", icon: UserCog },
      { key: "creditos", label: "Créditos", to: "/creditos", icon: Landmark },
      { key: "historial", label: "Historial Crediticio", to: "/historial", icon: FileStack },
      { key: "pagos", label: "Pagos y Multas", to: "/pagos", icon: CircleDollarSign },
      { key: "reportes", label: "Reportes", to: "/reportes", icon: FileChartColumn },
      { key: "usuarios", label: "Usuarios", to: "/usuarios", icon: User, roles: ["ADMIN"] },
      { key: "config", label: "Configuraciones", to: "/config", icon: Settings, roles: ["ADMIN"] },
    ],
    []
  );

  const visibleItems = items.filter(i => !i.roles || (me && i.roles.includes(me.rol)));
  const sidebarWidth = open ? SIDEBAR_W_OPEN : SIDEBAR_W_CLOSED;

  const currentItem =
    items.find(i => loc.pathname === i.to) ||
    items.find(i => loc.pathname.startsWith(i.to + "/"));

  function handleImportFromHeader() {
    setOpenImportSelector(true);
  }

  // NUEVO: ir a Calculadora
  function goCalculadora() {
    nav("/calculadora");
  }

  async function handleSheetsParsed(wb: { fileName: string }, selectedSheets: any[]) {
    try {
      setProgOpen(true);
      setProg(5);
      setProgLabel("Preparando importación…");

      const sw = await buildStaging({
        fileName: wb.fileName,
        sheets: selectedSheets,
        onProgress: (p, label) => {
          setProg(p);
          if (label) setProgLabel(label);
        },
      });

      setStaging(sw);
      setOpenImportSelector(false);
      setOpenImportWizard(true);
    } catch (err: any) {
      console.error(err);
      alert(`Error construyendo staging: ${err?.message ?? err}`);
    } finally {
      setProgOpen(false);
    }
  }

  function closeAllImport() {
    setOpenImportWizard(false);
    setOpenImportSelector(false);
    setStaging(null);
  }

  return (
    <>
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 h-dvh border-r border-[var(--baci-border)] bg-white z-40 transition-[width]"
        style={{ width: sidebarWidth }}
      >
        <div className="h-14 flex items-center px-3 border-b border-[var(--baci-border)]">
          <button
            className="btn-ghost rounded-[2px] px-2"
            onClick={() => setOpen(v => !v)}
            aria-label="toggle"
          >
            <span className="inline-block w-5 h-5 bg-[var(--baci-blue)] rounded-[2px]" />
          </button>
          {open && (
            <Link to="/" className="ml-2 text-[13px] font-semibold tracking-tight" style={{ color: "var(--baci-ink)" }}>
              Arrendamientos <span style={{ color: "var(--baci-blue)" }}>BACI</span>
            </Link>
          )}
        </div>

        <nav className="p-2 space-y-[2px]">
          {visibleItems.map(({ key, label, to, icon: Icon }) => (
            <NavLink
              key={key}
              to={to}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2 rounded-[2px] px-2 py-2 text-[13px] transition",
                  (isActive || location.pathname.startsWith(to + "/"))
                    ? "bg-[color-mix(in_oklab,var(--baci-blue),white_85%)] text-[color-mix(in_oklab,var(--baci-blue),black_10%)] font-medium"
                    : "hover:bg-[color-mix(in_oklab,var(--baci-blue),white_92%)]"
                ].join(" ")
              }
            >
              <Icon className="w-4 h-4" />
              {open && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Header */}
      <header
        className="fixed top-0 right-0 h-14 flex items-center justify-between px-4 border-b border-[var(--baci-border)] bg-white z-30"
        style={{ left: sidebarWidth }}
      >
        <div className="text-[13px] font-medium truncate" style={{ color: "var(--baci-ink)" }}>
          {currentItem?.label ?? "Inicio"}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-outline rounded-[2px] !h-8 !px-3 text-xs flex items-center gap-2"
            onClick={handleImportFromHeader}
            title="Importar desde Excel/CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importar
          </button>

          {/* NUEVO: Calculadora */}
          <button
            type="button"
            className="btn-outline rounded-[2px] !h-8 !px-3 text-xs flex items-center gap-2"
            onClick={goCalculadora}
            title="Calculadora de amortización"
          >
            <Calculator className="w-4 h-4" />
            Calculadora
          </button>

          <div className="relative">
            <button
              className="btn-ghost rounded-[2px] px-2 py-1.5 flex items-center gap-2"
              onClick={() => setMenuUser(v => !v)}
            >
              <Avatar name={me?.username} src={photo ?? undefined} />
              <span className="text-[13px] max-w-[180px] truncate">{me?.username ?? "Usuario"}</span>
              <ChevronDown className="w-4 h-4 opacity-70" />
            </button>

            {menuUser && (
              <div className="absolute right-0 mt-2 w-52 rounded-[2px] border border-[var(--baci-border)] bg-white shadow-lg z-50 overflow-hidden">
                <Link to="/perfil" className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-[color-mix(in_oklab,var(--baci-blue),white_92%)]">
                  <User className="w-4 h-4" /> Perfil
                </Link>
                <button
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-[color-mix(in_oklab,var(--baci-blue),white_92%)]"
                  onClick={() => { logout(); nav("/login", { replace: true }); }}
                >
                  <LogOut className="w-4 h-4" /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="app-main" style={{ marginLeft: sidebarWidth, paddingTop: HEADER_H }}>
        <div className="p-4">{children}</div>
      </main>

      {/* Selector inline */}
      <InlineImportDialog
        open={openImportSelector}
        onClose={() => setOpenImportSelector(false)}
        onParsed={handleSheetsParsed}
      />

      {/* Progreso de parseo */}
      {progOpen && (
        <div className="fixed inset-0 z-[10050] grid place-items-center bg-black/40">
          <div className="w-[92vw] max-w-md bg-white rounded-2 border shadow-lg p-4">
            <div className="text-[13px] font-semibold mb-2">Procesando…</div>
            <div className="text-[12.5px] mb-3 opacity-80">{progLabel}</div>
            <div className="w-full h-3 rounded-2 border overflow-hidden">
              <div
                className="h-full bg-[color-mix(in_oklab,var(--baci-blue),white_20%)] transition-[width] duration-200"
                style={{ width: `${Math.max(0, Math.min(100, prog))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Wizard */}
      {staging && (
        <ImportWizardModal
          open={openImportWizard}
          onClose={closeAllImport}
          workbook={staging}
          onCommitted={() => {}}
        />
      )}
    </>
  );
}
