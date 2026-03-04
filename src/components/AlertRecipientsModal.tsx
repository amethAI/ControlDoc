import React, { useState, useEffect } from 'react';
import { X, Mail, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AlertRecipientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  club: any;
  initialEmails: string[];
}

export default function AlertRecipientsModal({ isOpen, onClose, onSuccess, club, initialEmails }: AlertRecipientsModalProps) {
  const { user } = useAuth();
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEmails(initialEmails || []);
      setNewEmail('');
    }
  }, [isOpen, initialEmails]);

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmail && !emails.includes(newEmail)) {
      setEmails([...emails, newEmail]);
      setNewEmail('');
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter(e => e !== emailToRemove));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Si hay un correo escrito pero no se le dio a "Agregar", lo incluimos
      let finalEmails = [...emails];
      if (newEmail && !emails.includes(newEmail)) {
        finalEmails.push(newEmail);
      }

      const res = await fetch('/api/alert-recipients', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify({
          club_id: club.id,
          emails: finalEmails
        })
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        alert('Error al guardar destinatarios');
      }
    } catch (error) {
      alert('Error de red');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Editar Destinatarios</h3>
            <p className="text-sm text-slate-500">{club?.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <form onSubmit={handleAddEmail} className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="nuevo.correo@psmt.com"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </form>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {emails.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No hay correos configurados.</p>
            ) : (
              emails.map((email) => (
                <div key={email} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">{email}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveEmail(email)}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="pt-4 flex gap-3 border-t border-slate-100">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
