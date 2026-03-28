/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'sonner';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeProfile from './pages/EmployeeProfile';
import Clubs from './pages/Clubs';
import ClubDetail from './pages/ClubDetail';
import Attendance from './pages/Attendance';
import RendimientoVentas from './pages/RendimientoVentas';
import Configuracion from './pages/Configuracion';
import GestionUsuarios from './pages/GestionUsuarios';
import DestinatariosAlertas from './pages/DestinatariosAlertas';
import LogAuditoria from './pages/LogAuditoria';
import Expirations from './pages/Expirations';
import ChecklistContratos from './pages/ChecklistContratos';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" />;
  }
  return <>{children}</>;
};

function AppRoutes() {
  return (
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
        {/* Add more routes here as needed */}
      </Route>
    </Routes>
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
