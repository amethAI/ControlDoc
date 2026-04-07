import { apiFetch } from '../lib/api';
import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  Building2, 
  Save, 
  Plus, 
  Trash2, 
  AlertCircle,
  CheckCircle2,
  BarChart3
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import clsx from 'clsx';

interface PerformanceRecord {
  id?: string;
  date: string;
  employee_id: string;
  club_id: string;
  item_code: string;
  meta: number;
  actual_sales: number;
  average: number;
  demostradora_name?: string;
}

export default function RendimientoVentas() {
  const { user } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClub, setSelectedClub] = useState('');
  const [clubs, setClubs] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  if (user?.role === 'Coordinadora' || user?.role === 'Supervisor Cliente') {
    return (
      <div className="p-8 text-center">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg inline-block">
          No tienes permiso para acceder a esta sección.
        </div>
      </div>
    );
  }

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [clubsRes, employeesRes] = await Promise.all([
          apiFetch('/api/clubs'),
          apiFetch('/api/employees')
        ]);
        const clubsData = await clubsRes.json();
        const employeesData = await employeesRes.json();
        
        const filteredClubs = user?.role === 'Supervisor Interno' 
          ? clubsData.filter((c: any) => c.id === user.club_id)
          : clubsData;

        setClubs(filteredClubs);
        setEmployees(employeesData);
        
        if (filteredClubs.length > 0) {
          setSelectedClub(user?.role === 'Supervisor Interno' ? user.club_id : filteredClubs[0].id);
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        toast.error('Error al cargar datos iniciales');
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedClub && date) {
      fetchPerformance();
    }
  }, [selectedClub, date]);

  const fetchPerformance = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/performance?date=${date}&club_id=${selectedClub}`);
      const data = await res.json();
      
      if (data.length > 0) {
        setRecords(data);
      } else {
        // If no records, initialize with employees from that club
        const clubEmployees = employees.filter(e => e.club_id === selectedClub);
        setRecords(clubEmployees.map(e => ({
          date,
          employee_id: e.id,
          club_id: selectedClub,
          item_code: '',
          meta: 0,
          actual_sales: 0,
          average: 0,
          demostradora_name: e.full_name || ''
        })));
      }
    } catch (error) {
      console.error('Error fetching performance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordChange = (index: number, field: keyof PerformanceRecord, value: any) => {
    const newRecords = [...records];
    const record = { ...newRecords[index], [field]: value };
    
    // Auto-calculate average if meta and sales are present
    if (field === 'meta' || field === 'actual_sales') {
      const meta = field === 'meta' ? Number(value) : record.meta;
      const sales = field === 'actual_sales' ? Number(value) : record.actual_sales;
      // In the note, average seems to be a specific KPI, but let's assume it's sales/meta or similar
      // Actually, the note has "Average - Meta - Item - Venta"
      // Let's just let them input it for now as per the note
    }
    
    newRecords[index] = record;
    setRecords(newRecords);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records)
      });
      
      if (res.ok) {
        toast.success('Datos guardados correctamente');
        fetchPerformance();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al guardar datos');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSaving(false);
    }
  };

  const calculateCompliance = (meta: number, sales: number) => {
    if (meta === 0) return 0;
    return Math.round((sales / meta) * 100);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-200">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Metas y Rendimiento</h2>
            <p className="text-slate-500 text-sm">Gestión privada de ventas y promedios diarios</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={selectedClub}
              onChange={(e) => setSelectedClub(e.target.value)}
              className="pl-10 pr-8 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white transition-all"
            >
              {clubs.map(club => (
                <option key={club.id} value={club.id}>{club.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || records.length === 0}
            className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            {saving ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Guardar Cambios
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">Meta Total</span>
            <BarChart3 className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {records.reduce((acc, r) => acc + Number(r.meta || 0), 0)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">Venta Total</span>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {records.reduce((acc, r) => acc + Number(r.actual_sales || 0), 0)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-medium">% Cumplimiento</span>
            <CheckCircle2 className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {calculateCompliance(
              records.reduce((acc, r) => acc + Number(r.meta || 0), 0),
              records.reduce((acc, r) => acc + Number(r.actual_sales || 0), 0)
            )}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Demostradora</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Average</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Meta</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-48">Item (Código)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Venta</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32 text-center">% Logro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                      <p className="text-slate-500 text-sm font-medium">Cargando registros...</p>
                    </div>
                  </td>
                </tr>
              ) : records.length > 0 ? (
                records.map((record, index) => {
                  const employee = employees.find(e => e.id === record.employee_id);
                  const compliance = calculateCompliance(record.meta, record.actual_sales);
                  
                  return (
                    <tr key={record.employee_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200 shrink-0">
                            {(record.demostradora_name || employee?.full_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <input
                            type="text"
                            value={record.demostradora_name ?? (employee?.full_name || '')}
                            onChange={(e) => handleRecordChange(index, 'demostradora_name', e.target.value)}
                            placeholder="Nombre de la demostradora"
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-transparent hover:bg-white focus:bg-white"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          value={record.average || ''}
                          onChange={(e) => handleRecordChange(index, 'average', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          value={record.meta || ''}
                          onChange={(e) => handleRecordChange(index, 'meta', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-blue-600"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={record.item_code || ''}
                          onChange={(e) => handleRecordChange(index, 'item_code', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                          placeholder="Código Item"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          value={record.actual_sales || ''}
                          onChange={(e) => handleRecordChange(index, 'actual_sales', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-emerald-600"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={clsx(
                          "px-3 py-1 rounded-full text-xs font-bold",
                          compliance >= 100 ? "bg-emerald-100 text-emerald-700" :
                          compliance >= 80 ? "bg-blue-100 text-blue-700" :
                          compliance > 0 ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-500"
                        )}>
                          {compliance}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-8 w-8 text-slate-300" />
                      <p className="text-slate-500 text-sm">No hay colaboradoras asignadas a este club.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
