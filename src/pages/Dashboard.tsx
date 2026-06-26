import { apiFetch } from '../lib/api';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, AlertTriangle, FileWarning, UploadCloud, Building2, TrendingUp, RefreshCw, X } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Dashboard() {
  const { user } = useAuth();
  
  if (user?.role === 'Supervisor Interno' || user?.role === 'Coordinadora') {
    return <Navigate to="/clubes" replace />;
  }

  const [stats, setStats] = useState({
    totalEmployees: 0,
    expiredDocuments: 0,
    expiringSoonDocuments: 0,
    incompleteEmployees: 0,
    documentsUploadedToday: 0,
    clubDistribution: [] as { name: string, value: number }[],
    performanceStats: null as { totalMeta: number, totalVentas: number } | null,
    expiredList: [] as { id: string, employee_id: string, employee_name: string, type: string, date: string, status: string }[],
    expiringList: [] as { id: string, employee_id: string, employee_name: string, type: string, date: string, status: string }[]
  });
  const [loading, setLoading] = useState(true);
  const [projections, setProjections] = useState<{ label: string; count: number; month: string }[]>([]);
  const [compliance, setCompliance] = useState<{ name: string; total: number; withExpired: number; compliance: number }[]>([]);
  const [renewModal, setRenewModal] = useState<{ show: boolean; employeeId: string; employeeName: string; newDate: string }>({
    show: false, employeeId: '', employeeName: '', newDate: ''
  });
  const [renewing, setRenewing] = useState(false);

  const fetchStats = async () => {
    try {
      const isRestricted = user?.role === 'Coordinadora' || user?.role === 'Supervisor Interno';
      const params = isRestricted ? `?club_id=${user?.club_id}` : '';

      const [dashRes, projRes, compRes] = await Promise.all([
        apiFetch(`/api/dashboard${params}`),
        apiFetch(`/api/analytics/projections${params}`),
        apiFetch(`/api/analytics/compliance${params}`),
      ]);

      if (dashRes.ok) setStats(await dashRes.json());
      if (projRes.ok) setProjections(await projRes.json());
      if (compRes.ok) setCompliance(await compRes.json());
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRenew = async () => {
    if (!renewModal.newDate) return;
    setRenewing(true);
    try {
      const res = await apiFetch(`/api/employees/${renewModal.employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_end: renewModal.newDate }),
      });
      if (res.ok) {
        toast.success('Contrato renovado correctamente');
        setRenewModal({ show: false, employeeId: '', employeeName: '', newDate: '' });
        fetchStats();
      } else {
        toast.error('Error al renovar el contrato');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setRenewing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user]);

  const kpis: { name: string; value: string | number; icon: any; color: string; textColor: string }[] = [
    { name: 'Total Empleados Activos', value: stats.totalEmployees, icon: Users, color: 'bg-blue-500', textColor: 'text-blue-600' },
    { name: 'Documentos Vencidos', value: stats.expiredDocuments, icon: AlertTriangle, color: 'bg-red-500', textColor: 'text-red-600' },
    { name: 'Próximos a Vencer', value: stats.expiringSoonDocuments, icon: FileWarning, color: 'bg-amber-500', textColor: 'text-amber-600' },
    { name: 'Doc. Incompleta', value: stats.incompleteEmployees, icon: FileWarning, color: 'bg-orange-500', textColor: 'text-orange-600' },
  ];


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Panel de Control</h1>
          <p className="text-slate-500 mt-1">Resumen ejecutivo del estado de personal y documentación.</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium text-slate-700">Actualizado: {new Date().toLocaleDateString('es-PA')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.name} className="bg-white overflow-hidden shadow-sm rounded-2xl border border-slate-200 hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div className={`rounded-xl p-3 ${kpi.color} bg-opacity-10 ${kpi.textColor}`}>
                  <kpi.icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="text-right">
                  <dt className="text-sm font-medium text-slate-500 truncate">{kpi.name}</dt>
                  <dd className="text-3xl font-bold text-slate-900">{kpi.value}</dd>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Distribución por Club */}
        <div className="lg:col-span-2 bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-400" />
              Distribución de Personal por Club
            </h3>
          </div>
          <div className="p-6 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.clubDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {stats.clubDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Estado de Documentación */}
        <div className="bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-800">Estado de Documentación</h3>
          </div>
          <div className="p-6 h-[350px] flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Vencidos', value: stats.expiredDocuments },
                    { name: 'Próximos', value: stats.expiringSoonDocuments },
                    { name: 'Al día', value: Math.max(0, stats.totalEmployees * 8 - stats.expiredDocuments - stats.expiringSoonDocuments) }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#ef4444" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#10b981" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-3 gap-4 w-full text-center">
              <div>
                <div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-1"></div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Vencidos</p>
              </div>
              <div>
                <div className="w-3 h-3 rounded-full bg-amber-500 mx-auto mb-1"></div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Próximos</p>
              </div>
              <div>
                <div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto mb-1"></div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Al día</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Alertas de Documentación */}
        <div className="bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[400px]">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <h3 className="text-lg font-bold text-slate-800">Alertas de Documentos</h3>
            <div className="flex gap-2">
              {stats.expiredDocuments > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                  {stats.expiredDocuments} Vencidos
                </span>
              )}
              {stats.expiringSoonDocuments > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                  {stats.expiringSoonDocuments} Próximos
                </span>
              )}
            </div>
          </div>
          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {stats.expiredList.length > 0 || stats.expiringList.length > 0 ? (
              [...stats.expiredList, ...stats.expiringList].map((doc, idx) => (
                <div key={`${doc.id}-${idx}`} className="p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                  <div className={`p-2 rounded-lg shrink-0 ${doc.status === 'expired' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                    {doc.status === 'expired' ? <AlertTriangle className="h-5 w-5" /> : <FileWarning className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-bold text-slate-900 truncate">{doc.employee_name}</p>
                      <span className={`text-xs font-bold whitespace-nowrap ${doc.status === 'expired' ? 'text-red-600' : 'text-amber-600'}`}>
                        {new Date(doc.date).toLocaleDateString('es-PA', { timeZone: 'UTC' })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{doc.type}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className={`text-xs font-medium ${doc.status === 'expired' ? 'text-red-500' : 'text-amber-500'}`}>
                        {doc.status === 'expired' ? 'Vencido' : 'Próximo a vencer'}
                      </p>
                      {doc.status === 'expired' && doc.type?.toLowerCase().includes('contrato') && (
                        <button
                          onClick={() => setRenewModal({ show: true, employeeId: doc.employee_id, employeeName: doc.employee_name, newDate: '' })}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Renovar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center h-full">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-3">
                  <FileWarning className="h-6 w-6" />
                </div>
                <p className="font-medium text-slate-900">Todo al día</p>
                <p className="text-sm mt-1">No hay alertas críticas en este momento.</p>
              </div>
            )}
          </div>
        </div>

        {/* Actividad Reciente */}
        <div className="bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[400px]">
          <div className="px-6 py-5 border-b border-slate-100 shrink-0">
            <h3 className="text-lg font-bold text-slate-800">Actividad Reciente</h3>
          </div>
          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            <div className="p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Carga de Documentos</p>
                <p className="text-sm text-slate-500 mt-1">Se han cargado {stats.documentsUploadedToday} nuevos documentos en las últimas 24 horas.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Analytics: Proyección de Vencimientos + Cumplimiento por Club */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-800">Proyección de Vencimientos de Contratos</h3>
            <p className="text-xs text-slate-500 mt-0.5">Contratos no indefinidos que vencen en los próximos 12 meses</p>
          </div>
          <div className="p-6 h-[300px]">
            {projections.some(p => p.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projections}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [value, 'Contratos']}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {projections.map((entry, index) => (
                      <Cell key={`proj-${index}`} fill={entry.count > 5 ? '#ef4444' : entry.count > 2 ? '#f59e0b' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                No hay contratos por vencer en los próximos 12 meses
              </div>
            )}
          </div>
        </div>

        <div className="bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-800">Cumplimiento por Club</h3>
            <p className="text-xs text-slate-500 mt-0.5">% de empleados sin documentos vencidos</p>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto max-h-[270px]">
            {compliance.length > 0 ? compliance.map(club => (
              <div key={club.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 truncate">{club.name}</span>
                  <span className={`font-bold ml-2 shrink-0 ${club.compliance >= 80 ? 'text-emerald-600' : club.compliance >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {club.compliance}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${club.compliance >= 80 ? 'bg-emerald-500' : club.compliance >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${club.compliance}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{club.total - club.withExpired}/{club.total} empleados al día</p>
              </div>
            )) : (
              <div className="text-slate-400 text-sm text-center py-8">Sin datos disponibles</div>
            )}
          </div>
        </div>
      </div>

      {/* Renewal Modal */}
      {renewModal.show && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/50" onClick={() => setRenewModal(m => ({ ...m, show: false }))} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-slate-900">Renovar Contrato</h3>
                <button onClick={() => setRenewModal(m => ({ ...m, show: false }))} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-4">{renewModal.employeeName}</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nueva fecha de fin de contrato</label>
                <input
                  type="date"
                  value={renewModal.newDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setRenewModal(m => ({ ...m, newDate: e.target.value }))}
                  className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setRenewModal(m => ({ ...m, show: false }))}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRenew}
                  disabled={renewing || !renewModal.newDate}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {renewing ? 'Guardando...' : 'Renovar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
