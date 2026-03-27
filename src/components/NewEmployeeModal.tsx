import { apiFetch } from '../lib/api';
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NewEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clubId?: string;
}

export default function NewEmployeeModal({ isOpen, onClose, onSuccess, clubId }: NewEmployeeModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    full_name: '',
    cedula: '',
    position: '',
    contract_type: 'indefinido',
    contract_start: new Date().toISOString().split('T')[0],
    club_id: clubId || ''
  });
  const [clubs, setClubs] = useState<{id: string, name: string}[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!clubId) {
        apiFetch('/api/clubs')
          .then(res => res.json())
          .then(data => setClubs(data))
          .catch(err => console.error('Error fetching clubs:', err));
      } else {
        setFormData(prev => ({ ...prev, club_id: clubId }));
      }
    }
  }, [isOpen, clubId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.club_id) {
      setError('Por favor selecciona un club');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/employees', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-name': user?.name || ''
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        onSuccess();
        onClose();
        setFormData({
          full_name: '',
          cedula: '',
          position: '',
          contract_type: 'indefinido',
          contract_start: new Date().toISOString().split('T')[0],
          club_id: clubId || ''
        });
      } else {
        const data = await res.json();
        setError(data.error || 'Error al crear empleado');
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
        
        <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold leading-6 text-slate-900">
                Nuevo Empleado
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
              {!clubId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Club</label>
                  <select
                    required
                    value={formData.club_id}
                    onChange={e => setFormData({...formData, club_id: e.target.value})}
                    className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="">Selecciona un club</option>
                    {clubs.map(club => (
                      <option key={club.id} value={club.id}>{club.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                  className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Cédula</label>
                <input
                  type="text"
                  required
                  value={formData.cedula}
                  onChange={e => setFormData({...formData, cedula: e.target.value})}
                  className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                  placeholder="Ej: 8-888-8888"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Cargo</label>
                <input
                  type="text"
                  required
                  value={formData.position}
                  onChange={e => setFormData({...formData, position: e.target.value})}
                  className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tipo de Contrato</label>
                  <select
                    value={formData.contract_type}
                    onChange={e => setFormData({...formData, contract_type: e.target.value})}
                    className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="indefinido">Indefinido</option>
                    <option value="definido">Definido</option>
                    <option value="servicios">Servicios Profesionales</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Fecha de Ingreso</label>
                  <input
                    type="date"
                    required
                    value={formData.contract_start}
                    onChange={e => setFormData({...formData, contract_start: e.target.value})}
                    className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:col-start-2 disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : 'Guardar Empleado'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:col-start-1 sm:mt-0"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
