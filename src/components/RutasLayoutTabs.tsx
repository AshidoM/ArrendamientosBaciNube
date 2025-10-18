// src/components/RutasLayoutTabs.tsx
import { NavLink, Outlet } from "react-router-dom";

export default function RutasLayoutTabs() {
  return (
    <div className="max-w-[1200px]">
      {/* Tabs arriba, estilo simple */}
      <div className="mb-3 border-b border-[var(--baci-border)]">
        <div className="flex gap-2">
          <NavLink
            end
            to="/rutas"
            className={({ isActive }) =>
              [
                "px-3 py-2 text-[13px] rounded-t-[2px]",
                isActive
                  ? "border-b-2 border-[var(--baci-blue)] text-[var(--baci-blue)] font-medium"
                  : "text-[var(--baci-ink)] hover:text-[var(--baci-blue)]"
              ].join(" ")
            }
          >
            Rutas
          </NavLink>

          <NavLink
            to="/rutas/poblaciones"
            className={({ isActive }) =>
              [
                "px-3 py-2 text-[13px] rounded-t-[2px]",
                isActive
                  ? "border-b-2 border-[var(--baci-blue)] text-[var(--baci-blue)] font-medium"
                  : "text-[var(--baci-ink)] hover:text-[var(--baci-blue)]"
              ].join(" ")
            }
          >
            Poblaciones
          </NavLink>
        </div>
      </div>

      {/* Contenido de la pestaña */}
      <Outlet />
    </div>
  );
}
