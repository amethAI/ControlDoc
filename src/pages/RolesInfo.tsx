import React, { useEffect } from 'react';
import { Shield, Users, Building2, FileSpreadsheet, Edit3, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RolesInfo() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role !== 'Administrador') {
      navigate('/');
    }
  }, [user, navigate]);

  const roles = [
    {
      name: 'Administrador',
      description: 'Acceso total al sistema. Puede ver, editar, crear y eliminar cualquier registro en todos los clubes.',
      permissions: [
        'Ver todos los clubes y empleados',
        'Crear, editar y eliminar empleados',
        'Gestionar asistencia y rendimiento',
        'Acceso a la Configuración General (usuarios, alertas, respaldos)'
      ],
      color: 'bg-purple-100 text-purple-800',
      icon: Shield
    },
    {
      name: 'Supervisor Interno',
      description: 'Gestión completa pero restringida a un solo club asignado.',
      permissions: [
        'Ver solo la información de su club asignado',
        'Crear, editar y eliminar empleados de su club',
        'Gestionar asistencia y rendimiento de su club',
        'No tiene acceso a la Configuración General'
      ],
      color: 'bg-blue-100 text-blue-800',
      icon: Edit3
    },
    {
      name: 'Coordinadora',
      description: 'Rol de supervisión de personal para un club específico, con permisos limitados de edición.',
      permissions: [
        'Ver solo la información de su club asignado',
        'Ver lista de empleados y perfiles de su club',
        'No tiene acceso a Checklist ni Vencimientos',
        'No tiene acceso a Asistencia ni Configuración General'
      ],
      color: 'bg-emerald-100 text-emerald-800',
      icon: Users
    },
    {
      name: 'Supervisor Cliente',
      description: 'Rol de solo lectura (auditoría) para el cliente, con acceso a ver todos los clubes.',
      permissions: [
        'Ver la información de todos los clubes',
        'Acceso al Dashboard con métricas de todos los clubes',
        'No tiene acceso a Checklist ni Vencimientos',
        'No puede editar ningún dato ni agregar filas manuales',
        'No tiene acceso a Empleados, Asistencia, Rendimiento ni Configuración'
      ],
      color: 'bg-amber-100 text-amber-800',
      icon: Eye
    }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Roles y Permisos</h1>
        <p className="text-slate-500 mt-1">Detalle de los niveles de acceso y capacidades de cada rol en el sistema.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <div key={role.name} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-6 border-b border-slate-100 flex items-start gap-4">
                <div className={`p-3 rounded-lg ${role.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{role.name}</h2>
                  <p className="text-sm text-slate-500 mt-1">{role.description}</p>
                </div>
              </div>
              <div className="p-6 bg-slate-50 flex-1">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Permisos Clave</h3>
                <ul className="space-y-3">
                  {role.permissions.map((perm, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                      <div className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                      <span>{perm}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
