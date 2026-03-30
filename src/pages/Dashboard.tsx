import { apiFetch } from '../lib/api';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, AlertTriangle, FileWarning, UploadCloud, Building2, TrendingUp } from 'lucide-react';
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
    expiredList: [] as { id: string, employee_name: string, type: string, date: string, status: string }[],
    expiringList: [] as { id: string, employee_name: string, type: string, date: string, status: string }[]
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      // Coordinadora and Supervisor Interno are restricted to their club
      const isRestricted = user?.role === 'Coordinadora' || user?.role === 'Supervisor Interno';
      
      const url = isRestricted 
        ? `/api/dashboard?club_id=${user?.club_id}`
        : '/api/dashboard';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
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

  if (stats.performanceStats) {
    const compliance = stats.performanceStats.totalMeta > 0 
      ? Math.round((stats.performanceStats.totalVentas / stats.performanceStats.totalMeta) * 100) 
      : 0;
    
    kpis.push({ 
      name: 'Cumplimiento de Ventas Hoy', 
      value: `${compliance}%`, 
      icon: TrendingUp, 
      color: 'bg-emerald-500', 
      textColor: 'text-emerald-600' 
    });
  }

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
                    <p className={`text-xs mt-1 font-medium ${doc.status === 'expired' ? 'text-red-500' : 'text-amber-500'}`}>
                      {doc.status === 'expired' ? 'Vencido' : 'Próximo a vencer'}
                    </p>
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
    </div>
  );
}
