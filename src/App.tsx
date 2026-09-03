/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster, toast } from 'sonner';

// Static imports — always needed on first render
import Login from './pages/Login';
import Layout from './components/Layout';
import EmployeeLayout from './components/EmployeeLayout';
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
const Dotacion         = React.lazy(() => import('./pages/Dotacion'));
const DotacionPublica  = React.lazy(() => import('./pages/DotacionPublica'));
const Cumpleanos       = React.lazy(() => import('./pages/Cumpleanos'));
const EmployeeHome      = React.lazy(() => import('./pages/employee/EmployeeHome'));
const EmployeeDocuments = React.lazy(() => import('./pages/employee/EmployeeDocuments'));
const MyProfile         = React.lazy(() => import('./pages/employee/EmployeeProfile'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full p-12 text-slate-400 text-sm">
    Cargando...
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'Empleado') return <Navigate to="/mi-cuenta" replace />;
  return <>{children}</>;
};

const ProtectedEmployeeRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'Empleado') return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;
  const isAdmin = user.role === 'Super Administrador';
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const HomeRoute = () => {
  const { user } = useAuth();
  if (user?.role === 'Asistente RRHH') return <Navigate to="/empleados" replace />;
  return <PageErrorBoundary pageName="Dashboard"><Dashboard /></PageErrorBoundary>;
};

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Dotación pública — sin auth */}
        <Route path="/d/:token" element={<PageErrorBoundary pageName="Dotación"><DotacionPublica /></PageErrorBoundary>} />

        {/* Employee portal */}
        <Route
          path="/mi-cuenta"
          element={<ProtectedEmployeeRoute><EmployeeLayout /></ProtectedEmployeeRoute>}
        >
          <Route index element={<PageErrorBoundary pageName="Mi Cuenta"><EmployeeHome /></PageErrorBoundary>} />
          <Route path="documentos" element={<PageErrorBoundary pageName="Documentos"><EmployeeDocuments /></PageErrorBoundary>} />
          <Route path="perfil" element={<PageErrorBoundary pageName="Mi Perfil"><MyProfile /></PageErrorBoundary>} />
        </Route>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRoute />} />
          <Route path="empleados" element={<PageErrorBoundary pageName="Empleados"><Employees /></PageErrorBoundary>} />
          <Route path="empleados/:id" element={<PageErrorBoundary pageName="Perfil de Empleado"><EmployeeProfile /></PageErrorBoundary>} />
          <Route path="checklist-contratos" element={<PageErrorBoundary pageName="Check List"><ChecklistContratos /></PageErrorBoundary>} />
          <Route path="clubes" element={<PageErrorBoundary pageName="Clubes"><Clubs /></PageErrorBoundary>} />
          <Route path="clubes/:id" element={<PageErrorBoundary pageName="Detalle del Club"><ClubDetail /></PageErrorBoundary>} />
          <Route path="asistencia" element={<PageErrorBoundary pageName="Asistencia"><Attendance /></PageErrorBoundary>} />
          <Route path="rendimiento" element={<PageErrorBoundary pageName="Rendimiento"><RendimientoVentas /></PageErrorBoundary>} />
          <Route path="vencimientos" element={<PageErrorBoundary pageName="Vencimientos"><Expirations /></PageErrorBoundary>} />
          <Route path="configuracion" element={<AdminRoute><PageErrorBoundary pageName="Configuración"><Configuracion /></PageErrorBoundary></AdminRoute>} />
          <Route path="configuracion/usuarios" element={<AdminRoute><PageErrorBoundary pageName="Gestión de Usuarios"><GestionUsuarios /></PageErrorBoundary></AdminRoute>} />
          <Route path="configuracion/alertas" element={<AdminRoute><PageErrorBoundary pageName="Destinatarios"><DestinatariosAlertas /></PageErrorBoundary></AdminRoute>} />
          <Route path="configuracion/auditoria" element={<AdminRoute><PageErrorBoundary pageName="Auditoría"><LogAuditoria /></PageErrorBoundary></AdminRoute>} />
          <Route path="configuracion/accesos" element={<AdminRoute><PageErrorBoundary pageName="Accesos"><AccessLogs /></PageErrorBoundary></AdminRoute>} />
          <Route path="roles" element={<AdminRoute><PageErrorBoundary pageName="Roles y Permisos"><RolesInfo /></PageErrorBoundary></AdminRoute>} />
          <Route path="cumpleanos" element={<PageErrorBoundary pageName="Cumpleaños"><Cumpleanos /></PageErrorBoundary>} />
          <Route path="dotacion" element={<PageErrorBoundary pageName="Dotación"><Dotacion /></PageErrorBoundary>} />
        </Route>
      </Routes>
    </Suspense>
  );
}

/**
 * Listens for Service Worker updates and auto-reloads the page.
 *
 * Flow:
 *  1. Render deploys new code → new SW downloads in background (skipWaiting: true)
 *  2. New SW activates immediately and claims all open tabs (clientsClaim: true)
 *  3. `controllerchange` fires in every tab
 *  4. We show a toast and reload after 1.5s — users always get latest version
 *     without having to click anything.
 */
function useAutoUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;

    const handleControllerChange = () => {
      if (reloading) return; // prevent double reload
      reloading = true;
      toast.success('🚀 Nueva versión disponible — actualizando...', {
        duration: 1500,
      });
      setTimeout(() => window.location.reload(), 1500);
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);
}

export default function App() {
  useAutoUpdate();

  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </Router>
    </AuthProvider>
  );
}
