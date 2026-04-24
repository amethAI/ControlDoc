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
import PageErrorBoundary from './components/PageErrorBoundary';

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
          <Route index element={<PageErrorBoundary pageName="Dashboard"><Dashboard /></PageErrorBoundary>} />
          <Route path="empleados" element={<PageErrorBoundary pageName="Empleados"><Employees /></PageErrorBoundary>} />
          <Route path="empleados/:id" element={<PageErrorBoundary pageName="Perfil de Empleado"><EmployeeProfile /></PageErrorBoundary>} />
          <Route path="checklist-contratos" element={<PageErrorBoundary pageName="Check List"><ChecklistContratos /></PageErrorBoundary>} />
          <Route path="clubes" element={<PageErrorBoundary pageName="Clubes"><Clubs /></PageErrorBoundary>} />
          <Route path="clubes/:id" element={<PageErrorBoundary pageName="Detalle del Club"><ClubDetail /></PageErrorBoundary>} />
          <Route path="asistencia" element={<PageErrorBoundary pageName="Asistencia"><Attendance /></PageErrorBoundary>} />
          <Route path="rendimiento" element={<PageErrorBoundary pageName="Rendimiento"><RendimientoVentas /></PageErrorBoundary>} />
          <Route path="vencimientos" element={<PageErrorBoundary pageName="Vencimientos"><Expirations /></PageErrorBoundary>} />
          <Route path="configuracion" element={<PageErrorBoundary pageName="Configuración"><Configuracion /></PageErrorBoundary>} />
          <Route path="configuracion/usuarios" element={<PageErrorBoundary pageName="Gestión de Usuarios"><GestionUsuarios /></PageErrorBoundary>} />
          <Route path="configuracion/alertas" element={<PageErrorBoundary pageName="Destinatarios"><DestinatariosAlertas /></PageErrorBoundary>} />
          <Route path="configuracion/auditoria" element={<PageErrorBoundary pageName="Auditoría"><LogAuditoria /></PageErrorBoundary>} />
          <Route path="configuracion/accesos" element={<PageErrorBoundary pageName="Accesos"><AccessLogs /></PageErrorBoundary>} />
          <Route path="roles" element={<PageErrorBoundary pageName="Roles y Permisos"><RolesInfo /></PageErrorBoundary>} />
          <Route path="cumpleanos" element={<PageErrorBoundary pageName="Cumpleaños"><Cumpleanos /></PageErrorBoundary>} />
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
