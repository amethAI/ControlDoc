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
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel de Control</h1>
          <p className="text-slate-500 text-sm mt-0.5">Resumen ejecutivo del estado de personal y documentación.</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium text-slate-700">Actualizado: {new Date().toLocaleDateString('es-PA')}</span>
        </div>
      </div>

      {/* KPIs — compact inline */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.name} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
            <div className={`rounded-lg p-2 ${kpi.color} bg-opacity-10 ${kpi.textColor} shrink-0`}>
              <kpi.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-slate-900 leading-none">{kpi.value}</p>
              <p className="text-xs text-slate-500 mt-1 leading-tight">{kpi.name}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Proyección + Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800">Proyección de Vencimientos de Contratos</h3>
            <p className="text-xs text-slate-500">Próximos 12 meses — contratos no indefinidos</p>
          </div>
          <div className="p-4 h-[200px]">
            {projections.some(p => p.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projections}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} width={24} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [value, 'Contratos']}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {projections.map((entry, index) => (
                      <Cell key={`proj-${index}`} fill={entry.count > 5 ? '#ef4444' : entry.count > 2 ? '#f59e0b' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Sin contratos por vencer en los próximos 12 meses
              </div>
            )}
          </div>
        </div>

        {/* Alertas — promoted above the fold */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <h3 className="text-sm font-bold text-slate-800">Alertas</h3>
            <div className="flex gap-1.5">
              {stats.expiredDocuments > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">{stats.expiredDocuments} Venc.</span>
              )}
              {stats.expiringSoonDocuments > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">{stats.expiringSoonDocuments} Próx.</span>
              )}
            </div>
          </div>
          <div className="divide-y divide-slate-100 overflow-y-auto flex-1 max-h-[240px]">
            {[...stats.expiredList, ...stats.expiringList].length > 0 ? (
              [...stats.expiredList, ...stats.expiringList].map((doc, idx) => (
                <div key={`${doc.id}-${idx}`} className="p-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                  <div className={`p-1.5 rounded-lg shrink-0 ${doc.status === 'expired' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                    {doc.status === 'expired' ? <AlertTriangle className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start gap-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{doc.employee_name}</p>
                      <span className={`text-[10px] font-bold whitespace-nowrap ${doc.status === 'expired' ? 'text-red-600' : 'text-amber-600'}`}>
                        {new Date(doc.date).toLocaleDateString('es-PA', { timeZone: 'UTC' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-slate-500 truncate">{doc.type}</p>
                      {doc.status === 'expired' && doc.type?.toLowerCase().includes('contrato') && (
                        <button
                          onClick={() => setRenewModal({ show: true, employeeId: doc.employee_id, employeeName: doc.employee_name, newDate: '' })}
                          className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 ml-1 shrink-0"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          Renovar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center flex flex-col items-center justify-center h-full">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-2">
                  <FileWarning className="h-5 w-5" />
                </div>
                <p className="font-medium text-slate-900 text-sm">Todo al día</p>
                <p className="text-xs text-slate-400 mt-1">Sin alertas críticas</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Distribución + Estado Docs + Cumplimiento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Distribución por Club */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              Distribución por Club
            </h3>
          </div>
          <div className="p-4 h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.clubDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} width={20} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {stats.clubDistribution.map((entry, index) => (
                    <Cell key={`dist-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Estado de Documentación */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800">Estado de Documentación</h3>
          </div>
          <div className="p-4 flex items-center gap-4 h-[190px]">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Vencidos', value: stats.expiredDocuments },
                    { name: 'Próximos', value: stats.expiringSoonDocuments },
                    { name: 'Al día', value: Math.max(0, stats.totalEmployees * 8 - stats.expiredDocuments - stats.expiringSoonDocuments) }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={4}
                  dataKey="value"
                >
                  <Cell fill="#ef4444" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#10b981" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 flex-1">
              {[
                { label: 'Vencidos', value: stats.expiredDocuments, color: 'bg-red-500' },
                { label: 'Próximos', value: stats.expiringSoonDocuments, color: 'bg-amber-500' },
                { label: 'Al día', value: Math.max(0, stats.totalEmployees * 8 - stats.expiredDocuments - stats.expiringSoonDocuments), color: 'bg-emerald-500' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${item.color} shrink-0`} />
                  <div>
                    <p className="text-[10px] text-slate-500 leading-none">{item.label}</p>
                    <p className="text-sm font-bold text-slate-900">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cumplimiento por Club */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800">Cumplimiento por Club</h3>
            <p className="text-xs text-slate-500">% sin documentos vencidos</p>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto h-[190px]">
            {compliance.length > 0 ? compliance.map(club => (
              <div key={club.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 truncate">{club.name}</span>
                  <span className={`font-bold ml-2 shrink-0 ${club.compliance >= 80 ? 'text-emerald-600' : club.compliance >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {club.compliance}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${club.compliance >= 80 ? 'bg-emerald-500' : club.compliance >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${club.compliance}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{club.total - club.withExpired}/{club.total} empleados al día</p>
              </div>
            )) : (
              <div className="text-slate-400 text-xs text-center py-6">Sin datos disponibles</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer stat */}
      <div className="flex items-center gap-2 text-xs text-slate-400 pb-2">
        <UploadCloud className="h-3.5 w-3.5" />
        <span>{stats.documentsUploadedToday} documentos cargados en las últimas 24 horas</span>
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
