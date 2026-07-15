import { apiFetch } from '../lib/api';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogIn, LogOut, Search, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AccessLog {
  id: string;
  created_at: string;
  user_name: string;
  entity_name: string;
  club_id: string;
  ip_address: string;
  action_type: string;
}

type Filter = 'all' | 'success' | 'failed';

export default function AccessLogs() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { user } = useAuth();

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await apiFetch('/api/access-logs');
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (error) {
        console.error('Error fetching access logs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [user]);

  const isSuccess = (log: AccessLog) => log.action_type === 'Inicio de sesión';

  const filtered = logs.filter(log => {
    const matchSearch =
      log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.club_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchFilter =
      filter === 'all' ||
      (filter === 'success' && isSuccess(log)) ||
      (filter === 'failed' && !isSuccess(log));
    return matchSearch && matchFilter;
  });

  const totalSuccess = logs.filter(isSuccess).length;
  const totalFailed = logs.filter(l => !isSuccess(l)).length;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('es-PA', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'America/Panama'
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/configuracion" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Historial de Accesos</h2>
          <p className="text-sm text-slate-500 mt-0.5">Registro de inicios de sesión exitosos y fallidos.</p>
        </div>
      </div>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-xl border p-4 text-left transition-all ${filter === 'all' ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          >
            <div className="text-2xl font-bold text-slate-800">{logs.length}</div>
            <div className="text-xs text-slate-500 mt-1">Total de accesos</div>
          </button>
          <button
            onClick={() => setFilter('success')}
            className={`rounded-xl border p-4 text-left transition-all ${filter === 'success' ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-emerald-600">{totalSuccess}</div>
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="text-xs text-slate-500 mt-1">Exitosos</div>
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`rounded-xl border p-4 text-left transition-all ${filter === 'failed' ? 'border-red-400 bg-red-50 ring-1 ring-red-400' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-red-500">{totalFailed}</div>
              <XCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="text-xs text-slate-500 mt-1">Fallidos</div>
          </button>
        </div>
      )}

      <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
          <div className="flex-1 max-w-md relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buscar por usuario, correo o club..."
            />
          </div>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
            >
              Ver todos
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fecha y Hora (Panamá)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuario</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Correo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Club</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">Cargando...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                    No hay registros para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const ok = isSuccess(log);
                  return (
                    <tr key={log.id} className={`hover:bg-slate-50 ${!ok ? 'bg-red-50/40' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                            <CheckCircle className="h-3 w-3" /> Exitoso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <XCircle className="h-3 w-3" /> Fallido
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center ${ok ? 'bg-blue-100' : 'bg-red-100'}`}>
                            {ok
                              ? <LogIn className="h-3.5 w-3.5 text-blue-600" />
                              : <LogOut className="h-3.5 w-3.5 text-red-500" />
                            }
                          </div>
                          <span className="text-sm font-medium text-slate-900">{log.user_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {log.entity_name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {log.club_id || 'Global'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400 font-mono text-xs">
                        {log.ip_address || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''} · {totalFailed > 0 && (
              <span className="text-red-500 font-medium">{totalFailed} intento{totalFailed !== 1 ? 's' : ''} fallido{totalFailed !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
