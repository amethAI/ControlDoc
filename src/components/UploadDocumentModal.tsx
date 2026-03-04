import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeId: string;
  documentTypeId: string;
  documentTypeName: string;
}

export default function UploadDocumentModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  employeeId, 
  documentTypeId,
  documentTypeName 
}: UploadDocumentModalProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Por favor selecciona un archivo');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // In a real app, we would use FormData to upload the actual file
      // For this demo, we'll send the metadata and a mock file name
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify({
          employee_id: employeeId,
          document_type_id: documentTypeId,
          file_name: file.name,
          expiry_date: expiryDate || null,
          status: 'cargado'
        })
      });

      if (res.ok) {
        onSuccess();
        onClose();
        setFile(null);
        setExpiryDate('');
      } else {
        const data = await res.json();
        setError(data.error || 'Error al subir documento');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div className="fixed inset-0 bg-slate-900/50 transition-opacity" onClick={onClose} />
        
        <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold leading-6 text-slate-900">
                Subir {documentTypeName}
              </h3>
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
                <label className="block text-sm font-medium text-slate-700">Archivo</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-blue-400 transition-colors cursor-pointer" onClick={() => document.getElementById('file-upload')?.click()}>
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600">
                      <span className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                        {file ? file.name : 'Seleccionar archivo'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">PDF, PNG, JPG hasta 10MB</p>
                  </div>
                  <input 
                    id="file-upload" 
                    type="file" 
                    className="sr-only" 
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Fecha de Vencimiento (opcional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                />
              </div>

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
                  disabled={loading}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Subiendo...' : 'Subir Documento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
