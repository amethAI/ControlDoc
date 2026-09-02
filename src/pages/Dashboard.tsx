import { apiFetch } from '../lib/api';
import React, { useEffect, useState } from 'react';
import { useAuth, useLocale } from '../context/AuthContext';
import {
  Users, AlertTriangle, FileWarning, UploadCloud, Building2,
  RefreshCw, X, ShieldCheck, TrendingUp, Calendar,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

const PIE_COLORS = ['#3B82F6', '#22C55E', '#FBBF24', '#EF4444', '#8B5CF6', '#EC4899'];

/* ── design tokens ── */
const card = {
  background: '#0D1528',
  border: '1px solid rgba(255,255,255,.07)',
  borderRadius: 20,
};

function Card({ children, className = '', style = {} }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={`overflow-hidden ${className}`} style={{ ...card, ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <h3 className="text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,.9)', fontFamily: "'Outfit', sans-serif" }}>
        {title}
      </h3>
      {subtitle && (
        <p className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,.3)' }}>{subtitle}</p>
      )}
    </div>
  );
}

/* Custom bar for projections */
function ProjectionBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const isHigh = pct > 60;
  const barColor = isHigh ? '#EF4444' : pct > 35 ? '#FBBF24' : '#3B82F6';
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-8 text-right text-[10px] font-semibold shrink-0" style={{ color: 'rgba(255,255,255,.3)' }}>
        {label}
      </span>
      <div className="relative flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <span className="w-6 text-right text-[11px] font-bold shrink-0" style={{ color: 'rgba(255,255,255,.7)' }}>
        {count}
      </span>
    </div>
  );
}

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
    clubDistribution: [] as { name: string; value: number }[],
    performanceStats: null as { totalMeta: number; totalVentas: number } | null,
    expiredList: [] as { id: string; employee_id: string; employee_name: string; type: string; date: string; status: string }[],
    expiringList: [] as { id: string; employee_id: string; employee_name: string; type: string; date: string; status: string }[],
  });
  const [loading, setLoading] = useState(true);
  const [projections, setProjections] = useState<{ label: string; count: number; month: string; clubs: { name: string; count: number }[] }[]>([]);
  const [compliance, setCompliance] = useState<{ name: string; total: number; withExpired: number; compliance: number }[]>([]);
  const [renewModal, setRenewModal] = useState<{ show: boolean; employeeId: string; employeeName: string; newDate: string }>({
    show: false, employeeId: '', employeeName: '', newDate: '',
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

  useEffect(() => { fetchStats(); }, [user]);

  const kpis = [
    {
      label: 'Documentos Vencidos',
      value: stats.expiredDocuments,
      icon: AlertTriangle,
      from: '#3D0A0A', to: '#1A0505',
      accent: '#EF4444',
      glow: 'rgba(239,68,68,.25)',
    },
    {
      label: 'Próximos a Vencer',
      value: stats.expiringSoonDocuments,
      icon: FileWarning,
      from: '#3D2A00', to: '#1A1000',
      accent: '#FBBF24',
      glow: 'rgba(251,191,36,.2)',
    },
    {
      label: 'Doc. Incompleta',
      value: stats.incompleteEmployees,
      icon: FileWarning,
      from: '#3D1400', to: '#1A0800',
      accent: '#F97316',
      glow: 'rgba(249,115,22,.2)',
    },
    {
      label: 'Subidos Hoy',
      value: stats.documentsUploadedToday,
      icon: UploadCloud,
      from: '#002A1A', to: '#001008',
      accent: '#22C55E',
      glow: 'rgba(34,197,94,.2)',
    },
  ];

  const projMax = projections.length > 0 ? Math.max(...projections.map(p => p.count), 1) : 1;
  const alerts = [
    ...stats.expiredList.map(e => ({ ...e, severity: 'expired' as const })),
    ...stats.expiringList.map(e => ({ ...e, severity: 'expiring' as const })),
  ].slice(0, 8);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2" style={{ borderColor: '#3B82F6' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">

      {/* ── Hero card ── */}
      <div
        className="relative overflow-hidden rounded-[24px] p-6 sm:p-8"
        style={{
          background: 'linear-gradient(135deg, #0C1F5A 0%, #1A0B3D 50%, #070B16 100%)',
          border: '1px solid rgba(255,255,255,.08)',
        }}
      >
        {/* Glow orbs */}
        <div
          className="pointer-events-none absolute -top-12 -left-12 h-48 w-48 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,.25) 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-8 right-32 h-40 w-40 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,.2) 0%, transparent 70%)' }}
        />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ background: 'rgba(59,130,246,.2)', border: '1px solid rgba(59,130,246,.3)' }}
              >
                <TrendingUp className="h-4 w-4" style={{ color: '#60A5FA' }} />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(96,165,250,.7)' }}>
                Resumen Ejecutivo
              </span>
            </div>
            <p
              className="text-[13px] font-medium"
              style={{ color: 'rgba(255,255,255,.5)', fontFamily: "'Outfit', sans-serif" }}
            >
              {user?.name ? `Hola, ${user.name.split(' ')[0]}` : 'Panel de Control'}
            </p>
            <div className="mt-1 flex items-end gap-3">
              <span
                className="text-[52px] font-black leading-none"
                style={{ fontFamily: "'Outfit', sans-serif", color: '#fff' }}
              >
                {stats.totalEmployees}
              </span>
              <span className="mb-2 text-[14px] font-medium" style={{ color: 'rgba(255,255,255,.4)' }}>
                empleados activos
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-3"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}
            >
              <Calendar className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,.4)' }} />
              <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,.6)' }}>
                {new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <button
              onClick={fetchStats}
              className="flex h-10 w-10 items-center justify-center rounded-xl transition-all"
              style={{ background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.25)', color: '#60A5FA' }}
              title="Actualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map(kpi => (
          <div
            key={kpi.label}
            className="relative overflow-hidden rounded-[20px] p-5 transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              background: `linear-gradient(135deg, ${kpi.from} 0%, ${kpi.to} 100%)`,
              border: '1px solid rgba(255,255,255,.07)',
              boxShadow: `0 0 30px ${kpi.glow}`,
            }}
          >
            <div
              className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: `${kpi.accent}22`, border: `1px solid ${kpi.accent}40` }}
            >
              <kpi.icon className="h-4 w-4" style={{ color: kpi.accent }} />
            </div>
            <p
              className="text-[36px] font-black leading-none"
              style={{ fontFamily: "'Outfit', sans-serif", color: '#fff' }}
            >
              {kpi.value}
            </p>
            <p className="mt-1.5 text-[11px] font-medium" style={{ color: 'rgba(255,255,255,.4)' }}>
              {kpi.label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Row 2: Proyección + Alertas ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Proyección de vencimientos */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Proyección de Vencimientos de Contratos"
            subtitle="Contratos que vencen en los próximos 6 meses"
          />
          <div className="p-5">
            {projections.length === 0 ? (
              <p className="text-center py-8 text-[12px]" style={{ color: 'rgba(255,255,255,.25)' }}>
                Sin proyecciones disponibles
              </p>
            ) : (
              <div className="space-y-1">
                {projections.map(p => (
                  <ProjectionBar key={p.month} label={p.label} count={p.count} max={projMax} />
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Alertas */}
        <Card>
          <CardHeader title="Alertas Recientes" subtitle={`${alerts.length} documentos requieren atención`} />
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,.05)' }}>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10">
                <ShieldCheck className="h-8 w-8" style={{ color: '#22C55E' }} />
                <p className="text-[12px]" style={{ color: 'rgba(255,255,255,.3)' }}>Sin alertas activas</p>
              </div>
            ) : (
              alerts.map(a => (
                <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <div
                    className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: a.severity === 'expired' ? '#EF4444' : '#FBBF24', marginTop: 6 }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-medium" style={{ color: 'rgba(255,255,255,.8)' }}>
                      {a.employee_name}
                    </p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.35)' }}>
                      {a.type} · {a.date ? new Date(a.date).toLocaleDateString(locale, { day: '2-digit', month: 'short' }) : '—'}
                    </p>
                  </div>
                  {a.severity === 'expired' && a.type?.toLowerCase().includes('contrato') && (
                    <button
                      onClick={() => setRenewModal({ show: true, employeeId: a.employee_id, employeeName: a.employee_name, newDate: '' })}
                      className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors"
                      style={{ background: 'rgba(59,130,246,.15)', color: '#60A5FA', border: '1px solid rgba(59,130,246,.25)' }}
                    >
                      Renovar
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ── Row 3: Clubes + Compliance + Distribución ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Club distribution (pie) */}
        <Card>
          <CardHeader title="Distribución por Club" />
          {stats.clubDistribution.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Building2 className="h-8 w-8" style={{ color: 'rgba(255,255,255,.15)' }} />
            </div>
          ) : (
            <>
              <div className="px-5 pt-4" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.clubDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {stats.clubDistribution.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={0.85} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#111E38',
                        border: '1px solid rgba(255,255,255,.1)',
                        borderRadius: 10,
                        fontSize: 11,
                        color: '#fff',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="px-5 pb-4 space-y-1.5">
                {stats.clubDistribution.slice(0, 5).map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-[11px] truncate max-w-[120px]" style={{ color: 'rgba(255,255,255,.55)' }}>{c.name}</span>
                    </div>
                    <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,.7)' }}>{c.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Compliance */}
        <Card className="lg:col-span-2">
          <CardHeader title="Compliance por Club" subtitle="% de empleados sin documentos vencidos" />
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,.05)' }}>
            {compliance.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <p className="text-[12px]" style={{ color: 'rgba(255,255,255,.25)' }}>Sin datos de compliance</p>
              </div>
            ) : (
              compliance.slice(0, 7).map(c => {
                const pct = Math.round(c.compliance);
                const barColor = pct >= 90 ? '#22C55E' : pct >= 70 ? '#FBBF24' : '#EF4444';
                return (
                  <div key={c.name} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-32 truncate text-[12px] font-medium shrink-0" style={{ color: 'rgba(255,255,255,.7)' }}>
                      {c.name}
                    </span>
                    <div className="flex-1">
                      <div className="relative h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.07)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                    </div>
                    <span className="w-10 text-right text-[12px] font-bold shrink-0" style={{ color: barColor }}>
                      {pct}%
                    </span>
                    <span className="w-16 text-right text-[10px] shrink-0" style={{ color: 'rgba(255,255,255,.3)' }}>
                      {c.total - c.withExpired}/{c.total}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* ── Renew modal ── */}
      {renewModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#0D1528', border: '1px solid rgba(255,255,255,.1)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Renovar Contrato
              </h3>
              <button
                onClick={() => setRenewModal({ show: false, employeeId: '', employeeName: '', newDate: '' })}
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ color: 'rgba(255,255,255,.3)', background: 'rgba(255,255,255,.05)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-[12px]" style={{ color: 'rgba(255,255,255,.5)' }}>
              Empleado: <span className="font-semibold text-white">{renewModal.employeeName}</span>
            </p>
            <label className="block mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.4)' }}>
              Nueva fecha de vencimiento
            </label>
            <input
              type="date"
              value={renewModal.newDate}
              onChange={e => setRenewModal(m => ({ ...m, newDate: e.target.value }))}
              className="w-full rounded-xl px-4 py-2.5 text-[13px] font-medium outline-none"
              style={{
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.1)',
                color: '#fff',
              }}
            />
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setRenewModal({ show: false, employeeId: '', employeeName: '', newDate: '' })}
                className="flex-1 rounded-xl py-2.5 text-[12px] font-semibold"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleRenew}
                disabled={renewing || !renewModal.newDate}
                className="flex-1 rounded-xl py-2.5 text-[12px] font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}
              >
                {renewing ? 'Guardando...' : 'Renovar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
