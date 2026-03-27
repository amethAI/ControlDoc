import { apiFetch } from '../lib/api';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Upload, Download, FileText, AlertCircle, CheckCircle2, Clock, Edit2, UserMinus, UserPlus, Eye } from 'lucide-react';
import clsx from 'clsx';
import UploadDocumentModal from '../components/UploadDocumentModal';
import EditExpiryModal from '../components/EditExpiryModal';
import TerminateEmployeeModal from '../components/TerminateEmployeeModal';
import ReactivateEmployeeModal from '../components/ReactivateEmployeeModal';
import JSZip from 'jszip';
import { toast } from 'sonner';

interface Employee {
  id: string;
  full_name: string;
  cedula: string;
  position: string;
  contract_type: string;
  contract_start: string;
  contract_end: string | null;
  status: string;
  club_id: string;
  termination_reason?: string;
  termination_date?: string;
}

interface DocumentType {
  id: string;
  name: string;
  description: string;
  has_expiry: boolean;
  is_required: boolean;
}

interface EmployeeDocument {
  id: string;
  document_type_id: string;
  file_name: string;
  file_url: string;
  expiry_date: string | null;
  status: 'vigente' | 'proximo_vencer' | 'vencido' | 'sin_fecha';
  uploaded_at: string;
}

export default function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<{id: string, name: string} | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<EmployeeDocument | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [empRes, typesRes, docsRes] = await Promise.all([
        apiFetch(`/api/employees/${id}`),
        apiFetch('/api/document-types'),
        apiFetch(`/api/employees/${id}/documents`)
      ]);

      if (empRes.ok && typesRes.ok && docsRes.ok) {
        const empData = await empRes.json();
        const typesData = await typesRes.json();
        const docsData = await docsRes.json();
        
        setEmployee(empData);
        setDocTypes(typesData);
        
        // Process document status based on expiry date
        const processedDocs = docsData.map((doc: any) => {
          let status = doc.status;
          if (doc.expiry_date) {
            const expiry = new Date(doc.expiry_date);
            const today = new Date();
            const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) status = 'vencido';
            else if (diffDays <= 30) status = 'proximo_vencer';
            else status = 'vigente';
          } else {
            status = 'sin_fecha';
          }
          return { ...doc, status };
        });
        
        setDocuments(processedDocs);
      }
    } catch (error) {
      console.error('Error fetching employee data:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUploadClick = (typeId: string, typeName: string) => {
    setSelectedDocType({ id: typeId, name: typeName });
    setIsUploadModalOpen(true);
  };

  const handleEditClick = (doc: EmployeeDocument, typeName: string) => {
    setSelectedDoc(doc);
    setSelectedDocType({ id: doc.document_type_id, name: typeName });
    setIsEditModalOpen(true);
  };

  const getFileUrl = (url: string | undefined | null) => {
    if (!url) return '';
    return url;
  };

  const handleDownloadZip = async () => {
    if (!employee || documents.length === 0) return;
    
    setLoading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`Expediente_${employee.full_name.replace(/\s+/g, '_')}`);
      
      if (!folder) throw new Error('Could not create ZIP folder');

      const downloadPromises = documents.map(async (doc) => {
        try {
          const response = await apiFetch(getFileUrl(doc.file_url));
          if (!response.ok) throw new Error(`Failed to fetch ${doc.file_name}`);
          
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
            // This is likely the SPA fallback, not a real file
            folder.file(`${doc.file_name}_error.txt`, `El archivo no existe en el servidor (404). URL: ${doc.file_url}`);
            return;
          }

          const blob = await response.blob();
          folder.file(doc.file_name, blob, { binary: true });
        } catch (err) {
          console.error(`Error adding ${doc.file_name} to ZIP:`, err);
          folder.file(`${doc.file_name}_error.txt`, `No se pudo descargar este archivo: ${doc.file_url}`);
        }
      });

      await Promise.all(downloadPromises);
      
      const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });
      
      const zipName = `Expediente_${employee.full_name.replace(/\s+/g, '_')}.zip`;
      
      const url = URL.createObjectURL(content);
      const element = document.createElement('a');
      element.href = url;
      element.download = zipName;
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      
      // Cleanup with delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(element);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Error generating ZIP:', error);
      toast.error('Error al generar el archivo ZIP. Por favor intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando perfil...</div>;
  if (!employee) return <div className="p-8 text-center text-red-500">Empleado no encontrado</div>;

  const getStatusIcon = (status: string | undefined) => {
    switch (status) {
      case 'vigente': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'proximo_vencer': return <Clock className="h-5 w-5 text-amber-500" />;
      case 'vencido': return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'sin_fecha': return <CheckCircle2 className="h-5 w-5 text-slate-400" />;
      default: return <AlertCircle className="h-5 w-5 text-orange-500" />; // Sin documento
    }
  };

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'vigente': return 'bg-green-50 border-green-200 text-green-700';
      case 'proximo_vencer': return 'bg-amber-50 border-amber-200 text-amber-700';
      case 'vencido': return 'bg-red-50 border-red-200 text-red-700';
      case 'sin_fecha': return 'bg-slate-50 border-slate-200 text-slate-700';
      default: return 'bg-orange-50 border-orange-200 text-orange-700'; // Sin documento
    }
  };

  const getStatusText = (status: string | undefined) => {
    switch (status) {
      case 'vigente': return 'Vigente';
      case 'proximo_vencer': return 'Próximo a vencer';
      case 'vencido': return 'Vencido';
      case 'sin_fecha': return 'Cargado';
      default: return 'Sin documento';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/empleados" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h2 className="text-2xl font-bold text-slate-800">Perfil del Empleado</h2>
        </div>
        <div className="flex gap-3">
          {employee.status === 'activo' && (user?.role === 'Administrador' || (user?.role === 'Supervisor Interno' && user.club_id === employee.club_id)) && (
            <button 
              onClick={() => setIsTerminateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-red-200 rounded-lg shadow-sm text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100"
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Dar de Baja
            </button>
          )}
          {employee.status === 'inactivo' && (user?.role === 'Administrador' || (user?.role === 'Supervisor Interno' && user.club_id === employee.club_id)) && (
            <button 
              onClick={() => setIsReactivateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-green-200 rounded-lg shadow-sm text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Reactivar Empleado
            </button>
          )}
          <button 
            onClick={handleDownloadZip}
            disabled={documents.length === 0}
            className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4 mr-2 text-slate-500" />
            Descargar ZIP
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-8 items-start">
          <div className="h-24 w-24 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-3xl font-bold flex-shrink-0">
            {employee.full_name.charAt(0)}
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Nombre Completo</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{employee.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Cédula</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{employee.cedula}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Cargo</p>
              <p className="mt-1 text-slate-900">{employee.position}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Estado</p>
              <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                employee.status === 'activo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {employee.status === 'activo' ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            {employee.status === 'inactivo' && (
              <>
                <div>
                  <p className="text-sm font-medium text-slate-500">Motivo de Salida</p>
                  <p className="mt-1 text-red-600 font-medium">{employee.termination_reason}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Fecha de Salida</p>
                  <p className="mt-1 text-slate-900">{employee.termination_date ? new Date(employee.termination_date).toLocaleDateString() : 'N/A'}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-slate-900 mb-4">Documentación Obligatoria</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docTypes.map((type) => {
            const doc = documents.find(d => d.document_type_id === type.id);
            const status = doc?.status;
            
            return (
              <div key={type.id} className={`relative rounded-xl border p-5 flex flex-col gap-4 transition-colors ${getStatusColor(status)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(status)}
                    <div>
                      <h4 className="font-semibold">{type.name}</h4>
                      <p className="text-xs opacity-80 mt-0.5">{getStatusText(status)}</p>
                    </div>
                  </div>
                  {(user?.role === 'Administrador' || (user?.role === 'Supervisor Interno' && user.club_id === employee.club_id)) && (
                    <button 
                      onClick={() => handleUploadClick(type.id, type.name)}
                      className="p-2 bg-white/50 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200 shadow-sm"
                    >
                      <Upload className="h-4 w-4" />
                    </button>
                  )}
                </div>
                
                {doc && (
                  <div className="mt-auto pt-4 border-t border-black/5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 truncate pr-4">
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      <a 
                        href={getFileUrl(doc.file_url)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="truncate hover:text-blue-600 hover:underline transition-all font-medium"
                        title="Ver documento"
                      >
                        {doc.file_name}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.expiry_date && (
                        <span className="flex-shrink-0 text-xs font-medium text-slate-500">
                          Vence: {new Date(doc.expiry_date).toLocaleDateString()}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <a 
                          href={getFileUrl(doc.file_url)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 bg-white/80 hover:bg-white rounded-md text-blue-600 shadow-sm border border-slate-200 transition-all text-xs font-bold"
                          title="Ver documento"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </a>
                        {(user?.role === 'Administrador' || (user?.role === 'Supervisor Interno' && user.club_id === employee.club_id)) && (
                          <button 
                            onClick={() => handleEditClick(doc, type.name)}
                            className="p-1.5 bg-white/80 hover:bg-white rounded-md text-slate-600 hover:text-blue-600 shadow-sm border border-slate-200 transition-all"
                            title="Editar fecha"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedDocType && (
        <UploadDocumentModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={fetchData}
          employeeId={employee.id}
          documentTypeId={selectedDocType.id}
          documentTypeName={selectedDocType.name}
          availableDocTypes={docTypes.map(t => ({ id: t.id, name: t.name }))}
        />
      )}

      {selectedDoc && selectedDocType && (
        <EditExpiryModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={fetchData}
          documentId={selectedDoc.id}
          documentName={selectedDocType.name}
          currentDate={selectedDoc.expiry_date}
        />
      )}

      <TerminateEmployeeModal
        isOpen={isTerminateModalOpen}
        onClose={() => setIsTerminateModalOpen(false)}
        onSuccess={fetchData}
        employeeId={employee.id}
        employeeName={employee.full_name}
      />

      <ReactivateEmployeeModal
        isOpen={isReactivateModalOpen}
        onClose={() => setIsReactivateModalOpen(false)}
        onSuccess={fetchData}
        employeeId={employee.id}
        employeeName={employee.full_name}
      />
    </div>
  );
}
