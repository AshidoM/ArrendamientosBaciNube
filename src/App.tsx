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
import Historial from "./pages/HistorialCrediticio";
import Pagos from "./pages/Pagos";
import Reportes from "./pages/Reportes";
import Usuarios from "./pages/Usuarios";
import Config from "./pages/Config";
import Perfil from "./pages/Perfil";
import Accesos from "./pages/Accesos";

import AppShell from "./components/AppShell";
import RutasLayoutTabs from "./components/RutasLayoutTabs";

import { getUser } from "./auth";

function RequireAuth() {
  const me = getUser();
  const loc = useLocation();
  if (!me) return <Navigate to="/login" replace state={{ from: loc }} />;
  return <Outlet />;
}

function Layout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/rutas" element={<RutasLayoutTabs />}>
            <Route index element={<Rutas />} />
            <Route path="poblaciones" element={<Poblaciones />} />
          </Route>
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
          {/* NUEVO */}
          <Route path="/accesos" element={<Accesos />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
