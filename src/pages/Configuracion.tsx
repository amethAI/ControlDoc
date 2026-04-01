import { apiFetch } from '../lib/api';
import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Settings, Users, Bell, Shield, Database, Download, FileSpreadsheet, Upload, Send, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import ConfirmModal from '../components/ConfirmModal';

export default function Configuracion() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSendingAlerts, setIsSendingAlerts] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showTestAlertConfirm, setShowTestAlertConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (user?.role !== 'Administrador') {
    return (
      <div className="p-8 text-center text-red-500">
        No tienes permisos para acceder a esta sección.
      </div>
    );
  }

  const handleDownloadBackup = async () => {
    try {
      const response = await apiFetch('/api/backup/database');
      if (!response.ok) throw new Error('Error al descargar');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `psmt-backup-${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading backup:', error);
      toast.error('Error al descargar el respaldo');
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await apiFetch('/api/backup/employees-csv');
      if (!response.ok) throw new Error('Error al exportar');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `empleados-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Error al exportar CSV');
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setShowRestoreConfirm(true);
  };

  const executeRestore = async () => {
    if (!selectedFile) return;

    setIsRestoring(true);
    try {
      const response = await apiFetch('/api/restore/database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: selectedFile,
      });

      if (response.ok) {
        toast.success('Base de datos restaurada con éxito. La página se recargará.');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al restaurar la base de datos');
      }
    } catch (error) {
      toast.error('Error de red al intentar restaurar la base de datos');
    } finally {
      setIsRestoring(false);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleTestAlerts = async () => {
    setShowTestAlertConfirm(true);
  };

  const executeTestAlerts = async () => {
    setIsSendingAlerts(true);
    setPreviewUrl(null);
    try {
      const response = await apiFetch('/api/alerts/send', {
        method: 'POST',
        headers: {
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        }
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        if (data.isRealEmail) {
          toast.success('Alertas enviadas con éxito a los correos configurados.');
        } else {
          toast.success('Prueba realizada con éxito (Simulación).');
          if (data.previewUrls && data.previewUrls.length > 0) {
            setPreviewUrl(data.previewUrls[0]);
          }
        }
      } else {
        toast.error(data.error || 'Error al enviar alertas');
      }
    } catch (error) {
      toast.error('Error de red al intentar enviar alertas');
    } finally {
      setIsSendingAlerts(false);
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

            <button 
              onClick={handleTestAlerts}
              disabled={isSendingAlerts}
              className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg group-hover:bg-rose-100">
                  {isSendingAlerts ? (
                    <div className="animate-spin h-5 w-5 border-2 border-rose-600 border-t-transparent rounded-full" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Probar Envío de Alertas</p>
                  <p className="text-xs text-slate-500">Enviar correos de prueba ahora</p>
                </div>
              </div>
            </button>
            {previewUrl && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm text-blue-800 font-medium mb-2">Simulación de correo generada con éxito:</p>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm underline break-all">
                  Ver correo de prueba en Ethereal Email
                </a>
              </div>
            )}
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

        <Link to="/configuracion/accesos" className="bg-white shadow-sm rounded-xl border border-slate-200 p-6 flex items-start gap-4 hover:border-blue-300 hover:shadow-md transition-all">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <LogIn className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-medium text-slate-900">Historial de Accesos</h3>
            <p className="text-sm text-slate-500 mt-1">Consulta cuándo y desde dónde ingresó cada usuario a la plataforma.</p>
          </div>
        </Link>
      </div>

      <ConfirmModal
        isOpen={showRestoreConfirm}
        onClose={() => {
          setShowRestoreConfirm(false);
          setSelectedFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        onConfirm={executeRestore}
        title="Restaurar Base de Datos"
        message="¿Estás seguro de que deseas restaurar la base de datos? Esto SOBREESCRIBIRÁ todos los datos actuales con los del archivo seleccionado."
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={showTestAlertConfirm}
        onClose={() => setShowTestAlertConfirm(false)}
        onConfirm={executeTestAlerts}
        title="Enviar Prueba de Alertas"
        message="¿Deseas enviar una prueba de alertas ahora? Se enviarán correos a los destinatarios configurados."
      />
    </div>
  );
}
