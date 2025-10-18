import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Route as RouteIcon, Users, UserCheck, UserCog,
  Landmark, FileStack, CircleDollarSign, FileChartColumn,
  Settings, LogOut, User, ChevronDown
} from "lucide-react";
import { getUser, logout, type AppUser } from "../auth";
import { getPublicUrl } from "../lib/storage";

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

export default function AppShell({ children }: PropsWithChildren) {
  const nav = useNavigate();
  const loc = useLocation();
  const [me, setMe] = useState<AppUser | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [menuUser, setMenuUser] = useState(false);

  // medidas fijas del layout
  const SIDEBAR_W_OPEN = 240;
  const SIDEBAR_W_CLOSED = 64;
  const HEADER_H = 56; // h-14

  // carga sesión + escucha cambios de perfil
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

  // título para rutas hijas (/rutas/poblaciones)
  const currentItem =
    items.find(i => loc.pathname === i.to) ||
    items.find(i => loc.pathname.startsWith(i.to + "/"));

  return (
    <>
      {/* Sidebar FIXED */}
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
                  (isActive || loc.pathname.startsWith(to + "/"))
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

      {/* Header FIXED */}
      <header
        className="fixed top-0 right-0 h-14 flex items-center justify-between px-4 border-b border-[var(--baci-border)] bg-white z-30"
        style={{ left: sidebarWidth }}
      >
        <div className="text-[13px] font-medium truncate" style={{ color: "var(--baci-ink)" }}>
          {currentItem?.label ?? "Inicio"}
        </div>

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
      </header>

      {/* Contenido con su propio scroll */}
      <main
        className="app-main"
        style={{
          marginLeft: sidebarWidth,
          paddingTop: HEADER_H,
        }}
      >
        <div className="p-4">{children}</div>
      </main>
    </>
  );
}