// src/App.tsx
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Rutas from "./pages/Rutas";
import Poblaciones from "./pages/Poblaciones";
import Clientes from "./pages/Clientes";
import Coordinadoras from "./pages/Coordinadoras";
import Operadores from "./pages/Operadores";
import Creditos from "./pages/Creditos";
import Historial from "./pages/Historial";
import Pagos from "./pages/Pagos";
import Reportes from "./pages/Reportes";
import Usuarios from "./pages/Usuarios";
import Config from "./pages/Config";
import Perfil from "./pages/Perfil";

import AppShell from "./components/AppShell";
import RutasLayoutTabs from "./components/RutasLayoutTabs";

import { getUser } from "./auth";

/** Guard de autenticación */
function RequireAuth() {
  const me = getUser();
  const loc = useLocation();
  if (!me) return <Navigate to="/login" replace state={{ from: loc }} />;
  return <Outlet />;
}

/** Layout con tu AppShell y outlet de rutas hijas */
function Layout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/**
 * Nota: NO usamos <BrowserRouter> aquí para evitar doble Router.
 * El único Router vive en src/main.tsx y es <HashRouter>, que funciona
 * con file:// en Electron empaquetado.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          {/* "/" */}
          <Route index element={<Home />} />

          {/* Rutas y Poblaciones bajo el mismo menú */}
          <Route path="/rutas" element={<RutasLayoutTabs />}>
            <Route index element={<Rutas />} />
            <Route path="poblaciones" element={<Poblaciones />} />
          </Route>

          {/* Resto de secciones */}
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/coordinadoras" element={<Coordinadoras />} />
          <Route path="/operadores" element={<Operadores />} />
          <Route path="/creditos" element={<Creditos />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/pagos" element={<Pagos />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/config" element={<Config />} />
          <Route path="/perfil" element={<Perfil />} />
        </Route>
      </Route>

      {/* 404 → redirige al root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
