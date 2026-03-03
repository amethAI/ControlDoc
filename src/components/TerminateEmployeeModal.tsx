import React, { useState } from 'react';
import { X, UserMinus } from 'lucide-react';

interface TerminateEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeId: string;
  employeeName: string;
}

export default function TerminateEmployeeModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  employeeId, 
  employeeName 
}: TerminateEmployeeModalProps) {
  const [reason, setReason] = useState('Renuncia');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/employees/${employeeId}/terminate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termination_reason: reason,
          termination_date: date
        })
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Error al procesar la baja');
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
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                  <UserMinus className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold leading-6 text-slate-900">
                  Dar de Baja Empleado
                </h3>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500 mb-6">
              Estás a punto de dar de baja a <span className="font-semibold text-slate-900">{employeeName}</span>. 
              El empleado dejará de aparecer en las listas activas pero sus datos se mantendrán en el historial.
            </p>

            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Motivo de la Baja</label>
                <select
                  required
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 sm:text-sm"
                >
                  <option value="Renuncia">Renuncia</option>
                  <option value="Despido">Despido</option>
                  <option value="Terminación de Contrato">Terminación de Contrato</option>
                  <option value="Mutuo Acuerdo">Mutuo Acuerdo</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Fecha de Salida</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 py-2 px-3 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 sm:text-sm"
                />
              </div>

              <div className="mt-6 flex gap-3">
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
                  className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
                >
                  {loading ? 'Procesando...' : 'Confirmar Baja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
