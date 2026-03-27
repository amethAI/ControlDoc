import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';

interface DeleteDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeId: string;
  typeId: string;
  typeName: string;
}

export default function DeleteDocumentModal({
  isOpen,
  onClose,
  onSuccess,
  employeeId,
  typeId,
  typeName
}: DeleteDocumentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/employees/${employeeId}/documents/${typeId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        throw new Error('Error al eliminar el documento');
      }

      toast.success('Documento eliminado exitosamente');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Error al eliminar el documento');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Eliminar Documento
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-slate-600 mb-4">
            ¿Estás seguro de que deseas eliminar el documento <strong>{typeName}</strong>?
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Esta acción no se puede deshacer. El documento dejará de estar visible en el perfil del empleado y tendrás que subirlo nuevamente.
          </p>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
