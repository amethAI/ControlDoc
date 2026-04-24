/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'sonner';

// Static imports — always needed on first render
import Login from './pages/Login';
import Layout from './components/Layout';

// Lazy imports — each page loads only when navigated to
const Dashboard        = React.lazy(() => import('./pages/Dashboard'));
const Employees        = React.lazy(() => import('./pages/Employees'));
const EmployeeProfile  = React.lazy(() => import('./pages/EmployeeProfile'));
const Clubs            = React.lazy(() => import('./pages/Clubs'));
const ClubDetail       = React.lazy(() => import('./pages/ClubDetail'));
const Attendance       = React.lazy(() => import('./pages/Attendance'));
const RendimientoVentas = React.lazy(() => import('./pages/RendimientoVentas'));
const Configuracion    = React.lazy(() => import('./pages/Configuracion'));
const GestionUsuarios  = React.lazy(() => import('./pages/GestionUsuarios'));
const DestinatariosAlertas = React.lazy(() => import('./pages/DestinatariosAlertas'));
const LogAuditoria     = React.lazy(() => import('./pages/LogAuditoria'));
const AccessLogs       = React.lazy(() => import('./pages/AccessLogs'));
const Expirations      = React.lazy(() => import('./pages/Expirations'));
const ChecklistContratos = React.lazy(() => import('./pages/ChecklistContratos'));
const RolesInfo        = React.lazy(() => import('./pages/RolesInfo'));
const Cumpleanos       = React.lazy(() => import('./pages/Cumpleanos'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full p-12 text-slate-400 text-sm">
    Cargando...
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" />;
  }
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="empleados" element={<Employees />} />
          <Route path="empleados/:id" element={<EmployeeProfile />} />
          <Route path="checklist-contratos" element={<ChecklistContratos />} />
          <Route path="clubes" element={<Clubs />} />
          <Route path="clubes/:id" element={<ClubDetail />} />
          <Route path="asistencia" element={<Attendance />} />
          <Route path="rendimiento" element={<RendimientoVentas />} />
          <Route path="vencimientos" element={<Expirations />} />
          <Route path="configuracion" element={<Configuracion />} />
          <Route path="configuracion/usuarios" element={<GestionUsuarios />} />
          <Route path="configuracion/alertas" element={<DestinatariosAlertas />} />
          <Route path="configuracion/auditoria" element={<LogAuditoria />} />
          <Route path="configuracion/accesos" element={<AccessLogs />} />
          <Route path="roles" element={<RolesInfo />} />
          <Route path="cumpleanos" element={<Cumpleanos />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </Router>
    </AuthProvider>
  );
}
