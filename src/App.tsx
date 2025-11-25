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

import Amortizacion from "./pages/Amortizacion";
import CalculadoraAmortizacion from "./pages/CalculadoraAmortizacion"; // NUEVO
import UpdatesHUD from "./components/UpdatesHUD"; // <-- NUEVO

function RequireAuth() {
  const me = getUser();
  const loc = useLocation();
  if (!me) return <Navigate to="/login" replace state={{ from: loc }} />;
  return <Outlet />;
}

function Layout() {
  return (
    <AppShell>
      {/* HUD de auto-actualización, siempre montado */}
      <UpdatesHUD />
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      {/* RUTA PUBLICA: solo token, SIN auth ni layout */}
      <Route path="/amortizacion" element={<Amortizacion />} />

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
          <Route path="/accesos" element={<Accesos />} />

          {/* RUTA INTERNA (autenticada) por id */}
          <Route path="/amortizacion/:id" element={<Amortizacion />} />

          {/* Calculadora amortización */}
          <Route path="/calculadora" element={<CalculadoraAmortizacion />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
