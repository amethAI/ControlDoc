import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Check, AlertCircle, Building2, Briefcase, CreditCard } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

interface BulkEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clubId?: string;
}

interface NewEmployeeRow {
  id: string;
  full_name: string;
  cedula: string;
  position: string;
  club_id: string;
  status: 'pending' | 'saving' | 'success' | 'error';
  error?: string;
}

export default function BulkEmployeeModal({ isOpen, onClose, onSuccess, clubId }: BulkEmployeeModalProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<NewEmployeeRow[]>([]);
  const [clubs, setClubs] = useState<{id: string, name: string}[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/clubs').then(res => res.json()).then(setClubs);
      // Add initial 3 rows
      setRows([
        { id: '1', full_name: '', cedula: '', position: '', club_id: clubId || '', status: 'pending' },
        { id: '2', full_name: '', cedula: '', position: '', club_id: clubId || '', status: 'pending' },
        { id: '3', full_name: '', cedula: '', position: '', club_id: clubId || '', status: 'pending' },
      ]);
    }
  }, [isOpen, clubId]);

  const addRow = () => {
    setRows(prev => [...prev, { 
      id: Math.random().toString(36).substr(2, 9), 
      full_name: '', 
      cedula: '', 
      position: '', 
      club_id: clubId || '', 
      status: 'pending' 
    }]);
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const updateRow = (id: string, updates: Partial<NewEmployeeRow>) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, ...updates } : row));
  };

  const handleSaveAll = async () => {
    const validRows = rows.filter(row => row.full_name && row.cedula && row.position && row.club_id && (row.status === 'pending' || row.status === 'error'));
    if (validRows.length === 0) return;

    setIsSaving(true);
    let hasError = false;
    console.log('Iniciando carga masiva de', validRows.length, 'empleados');

    for (const row of validRows) {
      updateRow(row.id, { status: 'saving' });
      try {
        console.log(`Guardando empleado: ${row.full_name}`);
        const response = await fetch('/api/employees', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-role': user?.role || '',
            'x-user-id': user?.id || '',
            'x-user-name': user?.name || ''
          },
          body: JSON.stringify({
            full_name: row.full_name,
            cedula: row.cedula,
            position: row.position,
            club_id: row.club_id,
            contract_type: 'indefinido',
            contract_start: new Date().toISOString().split('T')[0],
            status: 'activo'
          })
        });

        if (response.ok) {
          updateRow(row.id, { status: 'success' });
        } else {
          const data = await response.json();
          updateRow(row.id, { status: 'error', error: data.error || 'Error' });
          hasError = true;
        }
      } catch (err) {
        updateRow(row.id, { status: 'error', error: 'Error de red' });
        hasError = true;
      }
    }

    setIsSaving(false);
    
    if (!hasError) {
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Carga Masiva de Empleados</h3>
            <p className="text-sm text-slate-500">Ingresa múltiples contrataciones de una sola vez.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Nombre Completo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Cédula</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Cargo / Posición</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Club / Sede</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr key={row.id} className={clsx(
                    "transition-colors",
                    row.status === 'success' ? "bg-green-50" : row.status === 'error' ? "bg-red-50" : "hover:bg-slate-50"
                  )}>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <UserPlus className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          value={row.full_name}
                          onChange={(e) => updateRow(row.id, { full_name: e.target.value })}
                          disabled={row.status === 'saving' || row.status === 'success'}
                          className="block w-full pl-9 pr-3 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Ej. Juan Pérez"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <CreditCard className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          value={row.cedula}
                          onChange={(e) => updateRow(row.id, { cedula: e.target.value })}
                          disabled={row.status === 'saving' || row.status === 'success'}
                          className="block w-full pl-9 pr-3 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0-000-0000"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Briefcase className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          value={row.position}
                          onChange={(e) => updateRow(row.id, { position: e.target.value })}
                          disabled={row.status === 'saving' || row.status === 'success'}
                          className="block w-full pl-9 pr-3 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Ej. Promotora"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Building2 className="h-4 w-4 text-slate-400" />
                        </div>
                        <select
                          value={row.club_id}
                          onChange={(e) => updateRow(row.id, { club_id: e.target.value })}
                          disabled={row.status === 'saving' || row.status === 'success' || !!clubId}
                          className="block w-full pl-9 pr-3 py-2 text-sm border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Seleccionar Club...</option>
                          {clubs.map(club => (
                            <option key={club.id} value={club.id}>{club.name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.status === 'saving' && (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent mx-auto"></div>
                      )}
                      {row.status === 'success' && (
                        <div className="bg-green-500 text-white p-1 rounded-full inline-flex">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                      {row.status === 'error' && (
                        <div className="text-red-600 flex items-center justify-center gap-1" title={row.error}>
                          <AlertCircle className="h-5 w-5" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.status !== 'saving' && row.status !== 'success' && (
                        <button 
                          onClick={() => removeRow(row.id)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={addRow}
            className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Agregar otra fila
          </button>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || rows.length === 0 || rows.every(r => r.status === 'success')}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Guardando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Guardar Todo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
