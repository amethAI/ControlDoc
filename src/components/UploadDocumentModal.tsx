import { apiFetch } from '../lib/api';
import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeId: string;
  documentTypeId: string;
  documentTypeName: string;
  availableDocTypes?: { id: string, name: string }[]; // Added to pass all types for auto-classification
  employeeContractEnd?: string | null;
  employeeContractType?: string;
}

interface FileClassification {
  file: File;
  typeId: string;
  typeName: string;
  expiryDate: string;
}

export default function UploadDocumentModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  employeeId, 
  documentTypeId,
  documentTypeName,
  availableDocTypes = [],
  employeeContractEnd,
  employeeContractType
}: UploadDocumentModalProps) {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileClassification[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFiles([]);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const selectedFiles = Array.from(e.target.files);
    
    // Auto-classify files based on name
    const newClassifications: FileClassification[] = selectedFiles.map(file => {
      const fileName = file.name.toUpperCase();
      let typeId = documentTypeId; // Default to the one clicked
      let typeName = documentTypeName;

      // Only auto-classify if we have available types
      if (availableDocTypes.length > 0) {
        if (fileName.includes('AVISO')) {
          const type = availableDocTypes.find(t => t.name.includes('Afiliación CSS'));
          if (type) { typeId = type.id; typeName = type.name; }
        } else if (fileName.includes('CONTRATO')) {
          const type = availableDocTypes.find(t => t.name.includes('Contrato firmado'));
          if (type) { typeId = type.id; typeName = type.name; }
        } else if (fileName.includes('DOCUMENTOS')) {
          const type = availableDocTypes.find(t => t.id === 'doc-personal-combined');
          if (type) { typeId = type.id; typeName = type.name; }
        } else if (fileName.includes('SOLICITUD')) {
          const type = availableDocTypes.find(t => t.name.includes('Solicitud de entrada'));
          if (type) { typeId = type.id; typeName = type.name; }
        }
      }

      return {
        file,
        typeId,
        typeName,
        expiryDate: ''
      };
    });

    setFiles(prev => [...prev, ...newClassifications]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateClassification = (index: number, newTypeId: string) => {
    const type = availableDocTypes.find(t => t.id === newTypeId);
    if (!type) return;
    
    setFiles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], typeId: type.id, typeName: type.name };
      return updated;
    });
  };
  
  const updateExpiryDate = (index: number, date: string) => {
    setFiles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], expiryDate: date };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Por favor selecciona al menos un archivo');
      return;
    }

    setError('');
    setLoading(true);

    let successCount = 0;
    let errorCount = 0;

    try {
      // Upload files sequentially to avoid overwhelming the server
      for (const item of files) {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('employee_id', employeeId);
        formData.append('document_type_id', item.typeId);
        
        const isContractTiedDoc = ['Afiliación CSS', 'Contrato firmado', 'Solicitud de entrada al club', 'Aviso de entrada'].some(name => item.typeName.includes(name));
        
        if (isContractTiedDoc) {
          if (employeeContractType === 'INDEFINIDA' || employeeContractType === 'INDEFINIDO') {
            // Indefinite contract, no expiry date
          } else if (employeeContractEnd) {
            formData.append('expiry_date', employeeContractEnd);
          }
        } else {
          // Use the specific expiry date if set
          const expiry = item.expiryDate;
          if (expiry && expiry !== 'indefinido') {
            formData.append('expiry_date', expiry);
          }
        }
        
        formData.append('status', 'cargado');

        const res = await apiFetch('/api/documents', {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Error uploading ${item.file.name}`);
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} documento(s) subido(s) exitosamente`);
        onSuccess();
        onClose();
      }
      if (errorCount > 0) {
        toast.error(`Error al subir ${errorCount} documento(s)`);
      }
    } catch (err) {
      toast.error('Error de conexión al subir documentos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div className="fixed inset-0 bg-slate-900/50 transition-opacity" onClick={onClose} />
        
        <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold leading-6 text-slate-900">
                  Subir Documentos
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Puedes subir múltiples archivos a la vez. El sistema intentará clasificarlos por su nombre.
                </p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div 
                  className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-blue-400 transition-colors cursor-pointer bg-slate-50" 
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600 justify-center">
                      <span className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500">
                        Seleccionar archivos
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">PDF, PNG, JPG hasta 10MB (Puedes seleccionar varios)</p>
                  </div>
                  <input 
                    id="file-upload" 
                    type="file" 
                    multiple
                    className="sr-only" 
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                  />
                </div>
              </div>

              {files.length > 0 && (
                <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                    <h4 className="text-sm font-medium text-slate-700">Archivos seleccionados ({files.length})</h4>
                  </div>
                  <ul className="divide-y divide-slate-200 max-h-60 overflow-y-auto">
                    {files.map((item, index) => (
                      <li key={index} className="p-4 bg-white hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <FileText className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate" title={item.file.name}>
                                {item.file.name}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {(item.file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                              
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-700 mb-1">Clasificación</label>
                                  <select
                                    value={item.typeId}
                                    onChange={(e) => updateClassification(index, e.target.value)}
                                    className="block w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                  >
                                    {availableDocTypes.map(type => (
                                      <option key={type.id} value={type.id}>{type.name}</option>
                                    ))}
                                  </select>
                                </div>
                                
                                {item.typeId !== 'doc-personal-combined' && !['Afiliación CSS', 'Contrato firmado', 'Solicitud de entrada al club', 'Aviso de entrada'].some(name => item.typeName.includes(name)) && (
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento</label>
                                    <div className="space-y-2">
                                      <input
                                        type="date"
                                        value={item.expiryDate}
                                        onChange={(e) => updateExpiryDate(index, e.target.value)}
                                        disabled={item.expiryDate === 'indefinido'}
                                        className="block w-full text-sm rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                                      />
                                      <div className="flex items-center">
                                        <input
                                          id={`indefinite-${index}`}
                                          type="checkbox"
                                          checked={item.expiryDate === 'indefinido'}
                                          onChange={(e) => {
                                            updateExpiryDate(index, e.target.checked ? 'indefinido' : '');
                                          }}
                                          className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                                        />
                                        <label htmlFor={`indefinite-${index}`} className="ml-2 block text-xs text-slate-600">
                                          Sin vencimiento (Indefinido)
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="text-slate-400 hover:text-red-500 p-1"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {files.some(f => f.typeId === 'doc-personal-combined') && (
                <div className="bg-blue-50 p-3 rounded-md border border-blue-100 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800">
                    <strong>Nota:</strong> Las fechas de vencimiento para los "Documentos Personales" se gestionarán a través de la carga masiva de Excel.
                  </p>
                </div>
              )}

              <div className="mt-5 sm:mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || files.length === 0}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Subiendo...' : `Subir ${files.length} Documento(s)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
