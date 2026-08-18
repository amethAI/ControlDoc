import { apiFetch } from '../lib/api';
import React, { useEffect, useState } from 'react';
import { useAuth, useLocale } from '../context/AuthContext';
import { Users, AlertTriangle, FileWarning, UploadCloud, Building2, RefreshCw, X, ShieldCheck } from 'lucide-react';
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

const COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#ec4899'];

export default function Dashboard() {
  const { user } = useAuth();
  const { locale } = useLocale();

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
  const [projections, setProjections] = useState<{ label: string; count: number; month: string; clubs: { name: string; count: number }[] }[]>([]);
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

  const kpis = [
    {
      name: 'Total Empleados Activos',
      value: stats.totalEmployees,
      icon: Users,
      accent: '#2563eb',
      bar: 88,
    },
    {
      name: 'Documentos Vencidos',
      value: stats.expiredDocuments,
      icon: AlertTriangle,
      accent: '#dc2626',
      bar: stats.expiredDocuments === 0 ? 0 : Math.min(95, 20 + stats.expiredDocuments * 6),
    },
    {
      name: 'Próximos a Vencer',
      value: stats.expiringSoonDocuments,
      icon: FileWarning,
      accent: '#d97706',
      bar: stats.expiringSoonDocuments === 0 ? 0 : Math.min(85, 15 + stats.expiringSoonDocuments * 5),
    },
    {
      name: 'Doc. Incompleta',
      value: stats.incompleteEmployees,
      icon: FileWarning,
      accent: '#ea580c',
      bar: stats.incompleteEmployees === 0 ? 0 : Math.min(80, 15 + stats.incompleteEmployees * 5),
    },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">Panel de Control</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Resumen ejecutivo del estado de personal y documentación.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span className="text-[11px] font-semibold text-slate-600">
            {new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map(kpi => (
          <div
            key={kpi.name}
            className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            {/* Icon */}
            <div
              className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${kpi.accent}14`, color: kpi.accent }}
            >
              <kpi.icon className="h-5 w-5" />
            </div>

            {/* Value */}
            <p
              className="text-[32px] font-extrabold leading-none tracking-tight"
              style={{ color: kpi.accent === '#2563eb' ? '#0f172a' : kpi.accent }}
            >
              {kpi.value}
            </p>
            <p className="mt-1.5 text-[11.5px] font-medium text-slate-500">{kpi.name}</p>

            {/* Progress bar */}
            <div
              className="mt-4 h-1 overflow-hidden rounded-full"
              style={{ background: `${kpi.accent}18` }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${kpi.bar}%`, background: kpi.accent }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Proyección + Alertas */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Proyección de vencimientos */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-[13px] font-bold text-slate-900">Proyección de Vencimientos de Contratos</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">Próximos 12 meses — contratos no indefinidos</p>
            </div>
          </div>
          <div className="h-[210px] p-4">
            {projections.some(p => p.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projections} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    allowDecimals={false}
                    width={24}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc', radius: 6 }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 40px rgba(0,0,0,.1)',
                      padding: '10px 14px',
                      fontSize: '12px',
                    }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const entry = payload[0].payload;
                      return (
                        <div className="text-xs">
                          <p className="mb-1 font-bold text-slate-800">
                            {entry.label} — {entry.count} contrato{entry.count !== 1 ? 's' : ''}
                          </p>
                          {entry.clubs?.map((c: { name: string; count: number }) => (
                            <p key={c.name} className="text-slate-500">
                              {c.name}: <span className="font-semibold text-slate-700">{c.count}</span>
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {projections.map((entry, index) => (
                      <Cell
                        key={`proj-${index}`}
                        fill={entry.count > 5 ? '#dc2626' : entry.count > 2 ? '#d97706' : '#2563eb'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Sin contratos por vencer en los próximos 12 meses
              </div>
            )}
          </div>
        </div>

        {/* Alertas */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-[13px] font-bold text-slate-900">Alertas</h3>
            <div className="flex gap-1.5">
              {stats.expiredDocuments > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                  {stats.expiredDocuments} Venc.
                </span>
              )}
              {stats.expiringSoonDocuments > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                  {stats.expiringSoonDocuments} Próx.
                </span>
              )}
            </div>
          </div>
          <div className="scrollbar-none max-h-[250px] flex-1 divide-y divide-slate-50 overflow-y-auto">
            {[...stats.expiredList, ...stats.expiringList].length > 0 ? (
              [...stats.expiredList, ...stats.expiringList].map((doc, idx) => (
                <div
                  key={`${doc.id}-${idx}`}
                  className="flex items-start gap-3 p-3.5 transition-colors hover:bg-slate-50"
                >
                  <div
                    className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${
                      doc.status === 'expired'
                        ? 'bg-red-50 text-red-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {doc.status === 'expired' ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <FileWarning className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="truncate text-[11.5px] font-semibold text-slate-900">
                        {doc.employee_name}
                      </p>
                      <span
                        className={`shrink-0 text-[10px] font-bold ${
                          doc.status === 'expired' ? 'text-red-600' : 'text-amber-600'
                        }`}
                      >
                        {new Date(doc.date).toLocaleDateString(locale, { timeZone: 'UTC' })}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <p className="truncate text-[10.5px] text-slate-400">{doc.type}</p>
                      {doc.status === 'expired' && doc.type?.toLowerCase().includes('contrato') && (
                        <button
                          onClick={() =>
                            setRenewModal({
                              show: true,
                              employeeId: doc.employee_id,
                              employeeName: doc.employee_name,
                              newDate: '',
                            })
                          }
                          className="ml-1 flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800"
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
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Todo al día</p>
                <p className="mt-1 text-xs text-slate-400">Sin alertas críticas</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Distribución + Estado + Cumplimiento */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Distribución por Club */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Building2 className="h-4 w-4 text-slate-400" />
            <h3 className="text-[13px] font-bold text-slate-900">Distribución por Club</h3>
          </div>
          <div className="h-[200px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.clubDistribution} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 9 }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 9 }}
                  width={20}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc', radius: 6 }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 40px rgba(0,0,0,.1)',
                  }}
                />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {stats.clubDistribution.map((entry, index) => (
                    <Cell key={`dist-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Estado de Documentación */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-[13px] font-bold text-slate-900">Estado de Documentación</h3>
          </div>
          <div className="flex h-[200px] items-center gap-4 p-4">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Vencidos', value: stats.expiredDocuments },
                    { name: 'Próximos', value: stats.expiringSoonDocuments },
                    {
                      name: 'Al día',
                      value: Math.max(
                        0,
                        stats.totalEmployees * 8 - stats.expiredDocuments - stats.expiringSoonDocuments
                      ),
                    },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={3}
                  dataKey="value"
                >
                  <Cell fill="#dc2626" />
                  <Cell fill="#d97706" />
                  <Cell fill="#059669" />
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: 'none',
                    boxShadow: '0 10px 40px rgba(0,0,0,.1)',
                    fontSize: '11px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3.5">
              {[
                { label: 'Vencidos', value: stats.expiredDocuments, color: '#dc2626' },
                { label: 'Próximos', value: stats.expiringSoonDocuments, color: '#d97706' },
                {
                  label: 'Al día',
                  value: Math.max(
                    0,
                    stats.totalEmployees * 8 - stats.expiredDocuments - stats.expiringSoonDocuments
                  ),
                  color: '#059669',
                },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: item.color }}
                  />
                  <div>
                    <p className="text-[10px] font-medium text-slate-400">{item.label}</p>
                    <p className="text-[13px] font-bold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cumplimiento por Club */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-[13px] font-bold text-slate-900">Cumplimiento por Club</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">% sin documentos vencidos</p>
          </div>
          <div className="scrollbar-none h-[200px] space-y-3.5 overflow-y-auto p-5">
            {compliance.length > 0 ? (
              compliance.map(club => (
                <div key={club.name}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="truncate text-[11.5px] font-medium text-slate-700">{club.name}</span>
                    <span
                      className="ml-2 shrink-0 text-[12px] font-bold"
                      style={{
                        color:
                          club.compliance >= 80
                            ? '#059669'
                            : club.compliance >= 60
                            ? '#d97706'
                            : '#dc2626',
                      }}
                    >
                      {club.compliance}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${club.compliance}%`,
                        background:
                          club.compliance >= 80
                            ? '#059669'
                            : club.compliance >= 60
                            ? '#d97706'
                            : '#dc2626',
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {club.total - club.withExpired}/{club.total} empleados al día
                  </p>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">Sin datos disponibles</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 pb-2 text-xs text-slate-400">
        <UploadCloud className="h-3.5 w-3.5" />
        <span>{stats.documentsUploadedToday} documentos cargados en las últimas 24 horas</span>
      </div>

      {/* Renewal Modal */}
      {renewModal.show && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setRenewModal(m => ({ ...m, show: false }))}
            />
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-slate-900">Renovar Contrato</h3>
                <button
                  onClick={() => setRenewModal(m => ({ ...m, show: false }))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-4 text-sm text-slate-600">{renewModal.employeeName}</p>
              <div className="mb-5">
                <label className="mb-1.5 block text-[12px] font-semibold text-slate-700">
                  Nueva fecha de fin de contrato
                </label>
                <input
                  type="date"
                  value={renewModal.newDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setRenewModal(m => ({ ...m, newDate: e.target.value }))}
                  className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setRenewModal(m => ({ ...m, show: false }))}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRenew}
                  disabled={renewing || !renewModal.newDate}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
