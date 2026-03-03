import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Settings, Users, Bell, Shield, Database, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Configuracion() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  if (user?.role !== 'Administrador') {
    return (
      <div className="p-8 text-center text-red-500">
        No tienes permisos para acceder a esta sección.
      </div>
    );
  }

  const handleDownloadBackup = () => {
    window.open('/api/backup/database', '_blank');
  };

  const handleExportCSV = () => {
    window.open('/api/backup/employees-csv', '_blank');
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('¿Estás seguro de que deseas restaurar la base de datos? Esto SOBREESCRIBIRÁ todos los datos actuales con los del archivo seleccionado.')) {
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    try {
      const response = await fetch('/api/restore/database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      });

      if (response.ok) {
        alert('Base de datos restaurada con éxito. La página se recargará.');
        window.location.reload();
      } else {
        const data = await response.json();
        alert(data.error || 'Error al restaurar la base de datos');
      }
    } catch (error) {
      alert('Error de red al intentar restaurar la base de datos');
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-medium text-slate-900 flex items-center">
            <Settings className="h-5 w-5 mr-2 text-slate-500" />
            Configuración General
          </h2>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-slate-900">Umbral de Alertas</h3>
            <p className="text-sm text-slate-500 mt-1">Días de anticipación para enviar alertas de documentos próximos a vencer.</p>
            <div className="mt-3 flex items-center gap-3">
              <input type="number" defaultValue={30} className="block w-24 border border-slate-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
              <span className="text-sm text-slate-500">días</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-medium text-slate-900 flex items-center">
            <Database className="h-5 w-5 mr-2 text-slate-500" />
            Mantenimiento y Respaldo
          </h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-500 mb-6">
            Utiliza estas herramientas para asegurar la integridad de tus datos y tener copias de seguridad externas.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={handleDownloadBackup}
              className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-100">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Descargar Base de Datos</p>
                  <p className="text-xs text-slate-500">Copia técnica completa (.sqlite)</p>
                </div>
              </div>
            </button>

            <button 
              onClick={handleRestoreClick}
              disabled={isRestoring}
              className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-100">
                  {isRestoring ? (
                    <div className="animate-spin h-5 w-5 border-2 border-amber-600 border-t-transparent rounded-full" />
                  ) : (
                    <Upload className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Restaurar Base de Datos</p>
                  <p className="text-xs text-slate-500">Subir archivo .sqlite para recuperar datos</p>
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".sqlite" 
                className="hidden" 
              />
            </button>

            <button 
              onClick={handleExportCSV}
              className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Exportar Empleados</p>
                  <p className="text-xs text-slate-500">Listado legible en Excel/CSV</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/configuracion/usuarios" className="bg-white shadow-sm rounded-xl border border-slate-200 p-6 flex items-start gap-4 hover:border-blue-300 hover:shadow-md transition-all">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-medium text-slate-900">Gestión de Usuarios</h3>
            <p className="text-sm text-slate-500 mt-1">Administra los accesos, roles y permisos de los usuarios del sistema.</p>
          </div>
        </Link>

        <Link to="/configuracion/alertas" className="bg-white shadow-sm rounded-xl border border-slate-200 p-6 flex items-start gap-4 hover:border-blue-300 hover:shadow-md transition-all">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-medium text-slate-900">Destinatarios de Alertas</h3>
            <p className="text-sm text-slate-500 mt-1">Configura quién recibe los correos de alerta por cada club.</p>
          </div>
        </Link>

        <Link to="/configuracion/auditoria" className="bg-white shadow-sm rounded-xl border border-slate-200 p-6 flex items-start gap-4 hover:border-blue-300 hover:shadow-md transition-all">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-medium text-slate-900">Log de Auditoría</h3>
            <p className="text-sm text-slate-500 mt-1">Revisa el historial inmutable de todas las acciones realizadas en el sistema.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
