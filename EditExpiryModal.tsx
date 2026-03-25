import { apiFetch } from '../lib/api';
import React, { useState, useEffect, useCallback } from 'react';
import { X, Upload, FileText, Check, AlertCircle, Trash2, User, FileType } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Employee {
  id: string;
  full_name: string;
}

interface DocumentType {
  id: string;
  name: string;
}

interface UploadItem {
  id: string;
  file: File;
  employeeId: string;
  documentTypeId: string;
  expiryDate: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function BulkUploadModal({ isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      apiFetch('/api/employees?status=activo').then(res => res.json()).then(setEmployees);
      apiFetch('/api/document-types').then(res => res.json()).then(setDocTypes);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => {
        // Auto-detect employee and doc type from filename
        const fileName = file.name.toLowerCase();
        let matchedEmployeeId = '';
        let matchedDocTypeId = '';

        // Try to match employee name
        const foundEmployee = employees.find(emp => 
          fileName.includes(emp.full_name.toLowerCase()) ||
          emp.full_name.toLowerCase().split(' ').every(part => fileName.includes(part))
        );
        if (foundEmployee) matchedEmployeeId = foundEmployee.id;

        // Try to match document type
        const foundDocType = docTypes.find(type => 
          fileName.includes(type.name.toLowerCase())
        );
        if (foundDocType) matchedDocTypeId = foundDocType.id;

        return {
          id: Math.random().toString(36).substr(2, 9),
          file,
          employeeId: matchedEmployeeId,
          documentTypeId: matchedDocTypeId,
          expiryDate: '',
          status: 'pending' as const
        };
      });
      setUploadItems(prev => [...prev, ...newFiles]);
    }
  };

  const removeItem = (id: string) => {
    setUploadItems(prev => prev.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setUploadItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleUploadAll = async () => {
    const pendingItems = uploadItems.filter(item => item.status === 'pending' || item.status === 'error');
    if (pendingItems.length === 0) return;

    // Validation
    const invalidItems = pendingItems.filter(item => !item.employeeId || !item.documentTypeId);
    if (invalidItems.length > 0) {
      toast.error('Por favor seleccione el empleado y tipo de documento para todos los archivos.');
      return;
    }

    setIsUploading(true);
    let hasError = false;
    console.log('Iniciando carga masiva de', pendingItems.length, 'documentos');

    for (const item of pendingItems) {
      updateItem(item.id, { status: 'uploading' });
      try {
        console.log(`Subiendo: ${item.file.name} para empleado ${item.employeeId}`);
        
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('employee_id', item.employeeId);
        formData.append('document_type_id', item.documentTypeId);
        if (item.expiryDate) {
          formData.append('expiry_date', item.expiryDate);
        }
        formData.append('status', 'vigente');

        const response = await apiFetch('/api/documents', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          updateItem(item.id, { status: 'success' });
        } else {
          updateItem(item.id, { status: 'error', error: 'Error al subir' });
          hasError = true;
        }
      } catch (err) {
        updateItem(item.id, { status: 'error', error: 'Error de red' });
        hasError = true;
      }
    }

    setIsUploading(false);
    
    if (!hasError) {
      toast.success('Documentos subidos exitosamente');
      setTimeout(() => {
        onSuccess();
        onClose();
        setUploadItems([]);
      }, 1000);
    } else {
      toast.warning('Se completó la carga con algunos errores');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Carga Masiva de Documentos</h3>
            <p className="text-sm text-slate-500">Sube múltiples archivos y asígnalos a empleados rápidamente.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {uploadItems.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center hover:border-blue-400 transition-colors group">
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="bulk-file-upload"
              />
              <label htmlFor="bulk-file-upload" className="cursor-pointer flex flex-col items-center">
                <div className="p-4 bg-blue-50 rounded-full mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="h-10 w-10 text-blue-500" />
                </div>
                <p className="text-lg font-semibold text-slate-700">Selecciona o arrastra archivos</p>
                <p className="text-sm text-slate-500 mt-1">Puedes subir varios documentos a la vez</p>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-medium text-slate-600">{uploadItems.length} archivos seleccionados</p>
                <label htmlFor="bulk-file-upload-more" className="text-sm text-blue-600 font-medium cursor-pointer hover:underline">
                  Agregar más archivos
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="bulk-file-upload-more"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-4 items-center justify-between bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-4">
                <div className="flex items-center gap-2 text-blue-700">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Acciones Rápidas:</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setUploadItems(prev => prev.map(item => ({ ...item, employeeId: e.target.value })));
                      e.target.value = '';
                    }}
                    className="text-xs border border-blue-200 rounded-lg px-2 py-1 bg-white focus:ring-blue-500"
                  >
                    <option value="">Asignar mismo Empleado a todos...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                    ))}
                  </select>
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setUploadItems(prev => prev.map(item => ({ ...item, documentTypeId: e.target.value })));
                      e.target.value = '';
                    }}
                    className="text-xs border border-blue-200 rounded-lg px-2 py-1 bg-white focus:ring-blue-500"
                  >
                    <option value="">Asignar mismo Tipo a todos...</option>
                    {docTypes.map(type => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                  <button 
                    onClick={() => setUploadItems([])}
                    className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1"
                  >
                    Limpiar lista
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {uploadItems.map((item) => (
                  <div key={item.id} className={clsx(
                    "p-4 rounded-xl border transition-all flex flex-col md:flex-row gap-4 items-start md:items-center",
                    item.status === 'success' ? "bg-green-50 border-green-200" : 
                    item.status === 'error' ? "bg-red-50 border-red-200" : "bg-white border-slate-200"
                  )}>
                    <div className="flex items-center gap-3 min-w-[200px] max-w-xs">
                      <div className="p-2 bg-slate-100 rounded-lg">
                        <FileText className="h-5 w-5 text-slate-500" />
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-medium text-slate-900 truncate" title={item.file.name}>{item.file.name}</p>
                        <p className="text-xs text-slate-500">{(item.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-4 w-4 text-slate-400" />
                        </div>
                        <select
                          value={item.employeeId}
                          onChange={(e) => updateItem(item.id, { employeeId: e.target.value })}
                          disabled={item.status === 'uploading' || item.status === 'success'}
                          className="block w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Asignar Empleado...</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <FileType className="h-4 w-4 text-slate-400" />
                        </div>
                        <select
                          value={item.documentTypeId}
                          onChange={(e) => updateItem(item.id, { documentTypeId: e.target.value })}
                          disabled={item.status === 'uploading' || item.status === 'success'}
                          className="block w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Tipo de Documento...</option>
                          {docTypes.map(type => (
                            <option key={type.id} value={type.id}>{type.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <input
                          type="date"
                          value={item.expiryDate}
                          onChange={(e) => updateItem(item.id, { expiryDate: e.target.value })}
                          disabled={item.status === 'uploading' || item.status === 'success'}
                          className="block w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Vencimiento"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {item.status === 'uploading' && (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                      )}
                      {item.status === 'success' && (
                        <div className="p-1 bg-green-500 text-white rounded-full">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="flex items-center gap-1 text-red-600 text-xs font-medium">
                          <AlertCircle className="h-4 w-4" />
                          <span>{item.error}</span>
                        </div>
                      )}
                      {item.status !== 'uploading' && item.status !== 'success' && (
                        <button 
                          onClick={() => removeItem(item.id)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleUploadAll}
            disabled={isUploading || uploadItems.length === 0 || uploadItems.every(i => i.status === 'success')}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Subir Todo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
