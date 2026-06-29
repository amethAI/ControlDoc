import { apiFetch } from '../lib/api';
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

interface Employee {
  id: string;
  full_name: string;
  cedula: string;
  position: string;
  contract_type: string;
  contract_start: string;
  contract_end: string | null;
  birth_date: string | null;
  banco?: string | null;
  cuenta_bancaria?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employee: Employee | null;
}

const CONTRACT_TYPES = [
  'Indefinido',
  'Temporal',
  'Por obra o servicio',
  'Pasantía',
  'Otro',
];

export default function EditEmployeeModal({ isOpen, onClose, onSuccess, employee }: Props) {
  const [form, setForm] = useState({
    full_name: '',
    cedula: '',
    position: '',
    contract_type: '',
    contract_start: '',
    contract_end: '',
    birth_date: '',
    banco: '',
    cuenta_bancaria: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (employee && isOpen) {
      setForm({
        full_name: employee.full_name || '',
        cedula: employee.cedula || '',
        position: employee.position || '',
        contract_type: employee.contract_type || '',
        contract_start: employee.contract_start || '',
        contract_end: employee.contract_end || '',
        birth_date: employee.birth_date || '',
        banco: employee.banco || '',
        cuenta_bancaria: employee.cuenta_bancaria || '',
      });
      setErrors({});
    }
  }, [employee, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;

    setLoading(true);
    setErrors({});

    try {
      const body: Record<string, string | null> = {
        full_name: form.full_name.trim(),
        cedula: form.cedula.trim(),
        position: form.position.trim(),
        contract_type: form.contract_type,
        banco: form.banco.trim() || null,
        cuenta_bancaria: form.cuenta_bancaria.trim() || null,
      };
      if (form.contract_start) body.contract_start = form.contract_start;
      if (form.contract_end) body.contract_end = form.contract_end;
      if (form.birth_date) body.birth_date = form.birth_date;

      const res = await apiFetch(`/api/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success('Empleado actualizado correctamente');
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        if (typeof data.error === 'object') {
          setErrors(
            Object.fromEntries(
              Object.entries(data.error).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])
            )
          );
        } else {
          toast.error(data.error || 'Error al actualizar el empleado');
        }
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-slate-900/50 transition-opacity" onClick={onClose} />

        <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 w-full sm:max-w-lg">
          <div className="bg-white px-6 pt-6 pb-4">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-slate-900">Editar Empleado</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cédula <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.cedula}
                  onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))}
                  className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.cedula && <p className="mt-1 text-xs text-red-600">{errors.cedula}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cargo</label>
                <input
                  type="text"
                  value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Contrato</label>
                <select
                  value={form.contract_type}
                  onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))}
                  className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">-- Seleccionar --</option>
                  {CONTRACT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Inicio de Contrato</label>
                  <input
                    type="date"
                    value={form.contract_start}
                    onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))}
                    className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fin de Contrato</label>
                  <input
                    type="date"
                    value={form.contract_end || ''}
                    onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))}
                    className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Nacimiento</label>
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
                  className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Datos Bancarios (Planilla PSMT)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Banco</label>
                    <input
                      type="text"
                      value={form.banco}
                      onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                      placeholder="Ej: BAC"
                      className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">No. de Cuenta</label>
                    <input
                      type="text"
                      value={form.cuenta_bancaria}
                      onChange={e => setForm(f => ({ ...f, cuenta_bancaria: e.target.value }))}
                      placeholder="Número de cuenta"
                      className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
