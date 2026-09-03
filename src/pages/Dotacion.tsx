import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Link2, Plus, ChevronDown, ChevronUp, Check, Clock, AlertCircle, Copy, FileText, X } from 'lucide-react';
import { toast } from 'sonner';

interface Tanda {
  id: string;
  club_id: string;
  descripcion: string;
  fecha: string;
  precio_por_camisa: number;
  total_compra: number | null;
  cantidad_total: number | null;
  token: string;
  activa: boolean;
  clubs: { name: string } | null;
  dotacion_asignaciones: { id: string; estado: string; monto_total: number; cantidad: number }[];
}

interface Asignacion {
  id: string;
  full_name: string;
  cedula: string;
  cantidad: number;
  cuotas: number;
  monto_total: number;
  estado: 'pendiente' | 'parcial' | 'pagado';
  accepted_at: string;
}

interface TandaDetail {
  tanda: { descripcion: string; fecha: string; precio_por_camisa: number; total_compra: number | null; club_name: string };
  resumen: { total_asignado: number; total_recuperado: number; total_pendiente: number };
  asignaciones: Asignacion[];
}

interface Club { id: string; name: string; }

const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: Clock },
  parcial:   { label: 'Parcial',   color: 'bg-blue-100 text-blue-700',   icon: AlertCircle },
  pagado:    { label: 'Pagado',    color: 'bg-green-100 text-green-700', icon: Check },
};

function EstadoBadge({ estado, cuotas, asignacionId, onPago }: {
  estado: 'pendiente' | 'parcial' | 'pagado';
  cuotas: number;
  asignacionId: string;
  onPago: (id: string) => void;
}) {
  const cfg = ESTADO_CONFIG[estado];
  const Icon = cfg.icon;
  const cuotaLabel = estado === 'parcial' ? 'Cuota 1 de 2' : estado === 'pendiente' && cuotas === 2 ? 'Cuota 1 de 2' : cfg.label;

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
        <Icon className="h-3 w-3" />
        {cuotaLabel}
      </span>
      {estado !== 'pagado' && (
        <button
          onClick={() => onPago(asignacionId)}
          className="text-xs px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
        >
          {estado === 'parcial' ? 'Marcar cuota 2' : 'Marcar descontado'}
        </button>
      )}
    </div>
  );
}

function NuevaTandaModal({ clubs, onClose, onCreated }: {
  clubs: Club[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'Super Administrador';
  const [form, setForm] = useState({
    club_id: isSuperAdmin ? '' : (user?.club_id || ''),
    descripcion: '',
    fecha: new Date().toISOString().split('T')[0],
    precio_por_camisa: '',
    cantidad_total: '',
    total_compra: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.club_id || !form.descripcion || !form.fecha || !form.precio_por_camisa) {
      toast.error('Completá todos los campos requeridos');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/dotacion/tandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          precio_por_camisa: parseFloat(form.precio_por_camisa),
          cantidad_total: form.cantidad_total ? parseInt(form.cantidad_total) : null,
          total_compra: form.total_compra ? parseFloat(form.total_compra) : null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Tanda creada');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear tanda');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Nueva tanda de dotación</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {isSuperAdmin && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Club *</label>
              <select
                value={form.club_id}
                onChange={e => setForm(f => ({ ...f, club_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Seleccioná un club</option>
                {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Descripción *</label>
            <input
              type="text"
              placeholder="Ej: Dotación septiembre 2026"
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha *</label>
              <input
                type="date"
                value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Precio por camisa *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="6.50"
                value={form.precio_por_camisa}
                onChange={e => setForm(f => ({ ...f, precio_por_camisa: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Camisas compradas</label>
              <input
                type="number"
                min="1"
                placeholder="30"
                value={form.cantidad_total}
                onChange={e => setForm(f => ({ ...f, cantidad_total: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Total de compra</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="181.00"
                value={form.total_compra}
                onChange={e => setForm(f => ({ ...f, total_compra: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creando...' : 'Crear tanda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TandaCard({ tanda, onRefresh }: { tanda: Tanda; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TandaDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const asigs = tanda.dotacion_asignaciones || [];
  const pendientes = asigs.filter(a => a.estado !== 'pagado').length;
  const totalAsignado = asigs.reduce((s, a) => s + Number(a.monto_total), 0);
  const camisasAsignadas = asigs.reduce((s, a) => s + Number((a as any).cantidad || 0), 0);
  const camisasDisponibles = tanda.cantidad_total != null ? tanda.cantidad_total - camisasAsignadas : null;

  const publicLink = `${window.location.origin}/d/${tanda.token}`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicLink);
    toast.success('Link copiado');
  };

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const res = await apiFetch(`/api/dotacion/tandas/${tanda.id}/reporte`);
      const data = await res.json();
      setDetail(data);
    } catch {
      toast.error('Error al cargar detalle');
    } finally {
      setLoadingDetail(false);
    }
  }, [tanda.id]);

  const toggleExpand = () => {
    if (!expanded && !detail) loadDetail();
    setExpanded(e => !e);
  };

  const handlePago = async (asignacionId: string) => {
    setApplyingId(asignacionId);
    try {
      const res = await apiFetch(`/api/dotacion/asignaciones/${asignacionId}/pago`, { method: 'POST' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Descuento registrado');
      await loadDetail();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar pago');
    } finally {
      setApplyingId(null);
    }
  };

  const toggleActiva = async () => {
    try {
      const res = await apiFetch(`/api/dotacion/tandas/${tanda.id}/toggle`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      toast.success(tanda.activa ? 'Link desactivado' : 'Link activado');
      onRefresh();
    } catch {
      toast.error('Error al actualizar estado');
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-start justify-between p-4 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-sm">{tanda.descripcion}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tanda.activa ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {tanda.activa ? 'Activo' : 'Cerrado'}
            </span>
            {pendientes > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {tanda.clubs?.name} · ${Number(tanda.precio_por_camisa).toFixed(2)} por camisa
            {tanda.total_compra ? ` · $${Number(tanda.total_compra).toFixed(2)} compra` : ''}
          </p>
          <p className="text-xs text-slate-400">
            {asigs.length} respuesta{asigs.length !== 1 ? 's' : ''} · ${totalAsignado.toFixed(2)} asignado
            {camisasDisponibles != null && (
              <span className={camisasDisponibles < 0 ? ' · text-red-500' : ''}>
                {' '}· {camisasAsignadas}/{tanda.cantidad_total} camisas
                {camisasDisponibles > 0 && ` (${camisasDisponibles} disponibles)`}
                {camisasDisponibles === 0 && ' (agotadas)'}
                {camisasDisponibles < 0 && ` (excedido por ${Math.abs(camisasDisponibles)})`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={copyLink} title="Copiar link" className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors">
            <Copy className="h-4 w-4" />
          </button>
          <button onClick={toggleActiva} title={tanda.activa ? 'Cerrar link' : 'Abrir link'} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <Link2 className="h-4 w-4" />
          </button>
          <button onClick={toggleExpand} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100">
          {loadingDetail ? (
            <div className="p-6 text-center text-sm text-slate-400">Cargando...</div>
          ) : detail ? (
            <>
              {/* Resumen financiero */}
              <div className="grid grid-cols-3 gap-px bg-slate-100 border-b border-slate-100">
                {[
                  { label: 'Total asignado', value: `$${detail.resumen.total_asignado.toFixed(2)}`, color: 'text-slate-800' },
                  { label: 'Recuperado', value: `$${detail.resumen.total_recuperado.toFixed(2)}`, color: 'text-green-600' },
                  { label: 'Pendiente', value: `$${detail.resumen.total_pendiente.toFixed(2)}`, color: 'text-amber-600' },
                ].map(item => (
                  <div key={item.label} className="bg-white p-3 text-center">
                    <p className="text-[10px] text-slate-400 mb-0.5">{item.label}</p>
                    <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Lista de asignaciones */}
              {detail.asignaciones.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  Ningún empleado ha respondido aún. Compartí el link.
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {detail.asignaciones.map(a => (
                    <div key={a.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{a.full_name}</p>
                        <p className="text-xs text-slate-400">{a.cedula} · {a.cantidad} camisa{a.cantidad !== 1 ? 's' : ''} · ${Number(a.monto_total).toFixed(2)}</p>
                      </div>
                      <div className="shrink-0">
                        <EstadoBadge
                          estado={a.estado}
                          cuotas={a.cuotas}
                          asignacionId={a.id}
                          onPago={applyingId ? () => {} : handlePago}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer con link para reporte */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-50 bg-slate-50/50">
                <p className="text-xs text-slate-400">
                  Link: <span className="font-mono">/d/{tanda.token.slice(0, 8)}…</span>
                </p>
                <button onClick={copyLink} className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <FileText className="h-3.5 w-3.5" />
                  Copiar link para empleadas
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function Dotacion() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'Super Administrador';
  const [tandas, setTandas] = useState<Tanda[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchTandas = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dotacion/tandas');
      const data = await res.json();
      setTandas(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar tandas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTandas();
    if (isSuperAdmin) {
      apiFetch('/api/clubs').then(r => r.json()).then(d => setClubs(Array.isArray(d) ? d : []));
    }
  }, [fetchTandas, isSuperAdmin]);

  const totalCompra = tandas.reduce((s, t) => s + Number(t.total_compra || 0), 0);
  const totalAsignado = tandas.reduce((s, t) =>
    s + (t.dotacion_asignaciones || []).reduce((ss, a) => ss + Number(a.monto_total), 0), 0);
  const totalPendiente = tandas.reduce((s, t) =>
    s + (t.dotacion_asignaciones || []).filter(a => a.estado !== 'pagado').reduce((ss, a) => ss + Number(a.monto_total), 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dotación de camisas</h1>
          <p className="text-sm text-slate-400 mt-0.5">Control de entrega y descuentos en planilla</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva tanda
        </button>
      </div>

      {/* Resumen global */}
      {tandas.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total comprado', value: `$${totalCompra.toFixed(2)}`, color: 'text-slate-800' },
            { label: 'Total asignado', value: `$${totalAsignado.toFixed(2)}`, color: 'text-slate-800' },
            { label: 'Pendiente de descontar', value: `$${totalPendiente.toFixed(2)}`, color: 'text-amber-600' },
          ].map(item => (
            <div key={item.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-400 mb-1">{item.label}</p>
              <p className={`text-lg font-semibold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista de tandas */}
      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Cargando...</div>
      ) : tandas.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-100 rounded-xl">
          <p className="text-slate-400 text-sm">No hay tandas todavía.</p>
          <button onClick={() => setShowModal(true)} className="mt-3 text-blue-600 text-sm font-medium hover:underline">
            Crear primera tanda
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tandas.map(t => <TandaCard key={t.id} tanda={t} onRefresh={fetchTandas} />)}
        </div>
      )}

      {showModal && (
        <NuevaTandaModal
          clubs={clubs}
          onClose={() => setShowModal(false)}
          onCreated={fetchTandas}
        />
      )}
    </div>
  );
}
