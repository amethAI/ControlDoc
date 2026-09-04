import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Link2, Plus, ChevronDown, ChevronUp, Check, Clock, AlertCircle, Copy, FileText, X, Download, Trash2, Calendar } from 'lucide-react';
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
  grupo_id: string | null;
  periodo_id: string | null;
  clubs: { name: string } | null;
  dotacion_asignaciones: { id: string; estado: string; monto_total: number; cantidad: number }[];
}

interface Grupo {
  id: string;
  nombre: string;
  presupuesto_total: number | null;
  dotacion_tandas: Tanda[];
}

interface Periodo {
  id: string;
  mes: string;
  descripcion: string;
  activo: boolean;
  created_at: string;
  dotacion_grupos: Grupo[];
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

interface GrupoForm {
  nombre: string;
  presupuesto_total: string;
  clubes: { club_id: string; cantidad_total: string }[];
}

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

function TandaCard({ tanda, onRefresh }: { tanda: Tanda; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TandaDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  const asigs = tanda.dotacion_asignaciones || [];
  const pendientes = asigs.filter(a => a.estado !== 'pagado').length;
  const totalAsignado = asigs.reduce((s, a) => s + Number(a.monto_total), 0);
  const camisasAsignadas = asigs.reduce((s, a) => s + Number((a as any).cantidad || 0), 0);
  const camisasDisponibles = tanda.cantidad_total != null ? tanda.cantidad_total - camisasAsignadas : null;
  const publicLink = `${window.location.origin}/d/${tanda.token}`;

  const copyLink = () => { navigator.clipboard.writeText(publicLink); toast.success('Link copiado'); };

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const res = await apiFetch(`/api/dotacion/tandas/${tanda.id}/reporte`);
      setDetail(await res.json());
    } catch { toast.error('Error al cargar detalle'); }
    finally { setLoadingDetail(false); }
  }, [tanda.id]);

  const toggleExpand = () => {
    if (!expanded && !detail) loadDetail();
    setExpanded(e => !e);
  };

  const downloadReporte = async () => {
    setDownloadingReport(true);
    try {
      const res = await apiFetch(`/api/dotacion/tandas/${tanda.id}/reporte-pdf`);
      if (!res.ok) { toast.error('Error al generar reporte'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-dotacion-${tanda.descripcion.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Error al descargar reporte'); }
    finally { setDownloadingReport(false); }
  };

  const downloadAuthPdf = async (asignacionId: string) => {
    setDownloadingPdf(asignacionId);
    try {
      const res = await apiFetch(`/api/dotacion/asignaciones/${asignacionId}/pdf`);
      if (!res.ok) { toast.error('PDF aún no disponible'); return; }
      const { url } = await res.json();
      window.open(url, '_blank');
    } catch { toast.error('Error al obtener PDF'); }
    finally { setDownloadingPdf(null); }
  };

  const handlePago = async (asignacionId: string) => {
    setApplyingId(asignacionId);
    try {
      const res = await apiFetch(`/api/dotacion/asignaciones/${asignacionId}/pago`, { method: 'POST' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Descuento registrado');
      await loadDetail();
      onRefresh();
    } catch (err: any) { toast.error(err.message || 'Error al registrar pago'); }
    finally { setApplyingId(null); }
  };

  const toggleActiva = async () => {
    try {
      const res = await apiFetch(`/api/dotacion/tandas/${tanda.id}/toggle`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      toast.success(tanda.activa ? 'Link desactivado' : 'Link activado');
      onRefresh();
    } catch { toast.error('Error al actualizar estado'); }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-start justify-between p-4 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-sm">{tanda.clubs?.name ?? tanda.descripcion}</p>
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
            ${Number(tanda.precio_por_camisa).toFixed(2)} por camisa
          </p>
          <p className="text-xs text-slate-400">
            {asigs.length} respuesta{asigs.length !== 1 ? 's' : ''} · ${totalAsignado.toFixed(2)} asignado
            {camisasDisponibles != null && (
              <span className={camisasDisponibles < 0 ? ' text-red-500' : ''}>
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
              <div className="grid grid-cols-3 gap-px bg-slate-100 border-b border-slate-100">
                {[
                  { label: 'Total asignado', value: `$${detail.resumen.total_asignado.toFixed(2)}`, color: 'text-slate-800' },
                  { label: 'Recuperado',     value: `$${detail.resumen.total_recuperado.toFixed(2)}`, color: 'text-green-600' },
                  { label: 'Pendiente',      value: `$${detail.resumen.total_pendiente.toFixed(2)}`, color: 'text-amber-600' },
                ].map(item => (
                  <div key={item.label} className="bg-white p-3 text-center">
                    <p className="text-[10px] text-slate-400 mb-0.5">{item.label}</p>
                    <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {detail.asignaciones.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  Ningún empleado ha respondido aún. Compartí el link.
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {detail.asignaciones.map(a => (
                    <div key={a.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{a.full_name}</p>
                        <p className="text-xs text-slate-400">{a.cedula} · {a.cantidad} camisa{a.cantidad !== 1 ? 's' : ''} · ${Number(a.monto_total).toFixed(2)}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => downloadAuthPdf(a.id)}
                          disabled={downloadingPdf === a.id}
                          title="Descargar autorización PDF"
                          className="p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-40 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
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

              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-50 bg-slate-50/50 gap-2 flex-wrap">
                <button onClick={copyLink} className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <FileText className="h-3.5 w-3.5" />
                  Copiar link para empleadas
                </button>
                <button
                  onClick={downloadReporte}
                  disabled={downloadingReport}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadingReport ? 'Generando…' : 'Reporte planilla'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GrupoSection({ grupo, onRefresh }: { grupo: Grupo; onRefresh: () => void }) {
  const tandas = grupo.dotacion_tandas || [];
  const totalAsignado = tandas.flatMap(t => t.dotacion_asignaciones || [])
    .reduce((s, a) => s + Number(a.monto_total), 0);
  const presupuesto = grupo.presupuesto_total;
  const pct = presupuesto ? Math.min(100, (totalAsignado / presupuesto) * 100) : null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{grupo.nombre}</p>
        {presupuesto != null && (
          <p className="text-xs text-slate-400">
            ${totalAsignado.toFixed(2)} / ${Number(presupuesto).toFixed(2)}
          </p>
        )}
      </div>
      {presupuesto != null && pct != null && (
        <div className="h-1.5 bg-slate-100 rounded-full mb-3 mx-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="space-y-2">
        {tandas.map(t => <TandaCard key={t.id} tanda={t} onRefresh={onRefresh} />)}
      </div>
    </div>
  );
}

function PeriodoSection({ periodo, onRefresh, defaultOpen }: { periodo: Periodo; onRefresh: () => void; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const grupos = periodo.dotacion_grupos || [];

  const [year, month] = periodo.mes.split('-');
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const label = `${monthNames[parseInt(month) - 1]} ${year}`;

  const allAsigs = grupos.flatMap(g => (g.dotacion_tandas || []).flatMap(t => t.dotacion_asignaciones || []));
  const totalRespuestas = allAsigs.length;
  const totalPendiente = allAsigs.filter(a => a.estado !== 'pagado').reduce((s, a) => s + Number(a.monto_total), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 bg-slate-100 rounded-xl">
            <Calendar className="h-4 w-4 text-slate-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">{label}</p>
            <p className="text-xs text-slate-400">
              {totalRespuestas} respuesta{totalRespuestas !== 1 ? 's' : ''}
              {totalPendiente > 0 && ` · $${totalPendiente.toFixed(2)} pendiente`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${periodo.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {periodo.activo ? 'Activo' : 'Cerrado'}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open && grupos.length > 0 && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4">
          {grupos.map(g => (
            <GrupoSection key={g.id} grupo={g} onRefresh={onRefresh} />
          ))}
        </div>
      )}

      {open && grupos.length === 0 && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4 text-center text-sm text-slate-400">
          Sin grupos configurados.
        </div>
      )}
    </div>
  );
}

function NuevoPeriodoModal({ clubs, onClose, onCreated }: {
  clubs: Club[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mes, setMes] = useState('');
  const [precioPorCamisa, setPrecioPorCamisa] = useState('');
  const [grupos, setGrupos] = useState<GrupoForm[]>([
    { nombre: '', presupuesto_total: '', clubes: [] },
  ]);
  const [saving, setSaving] = useState(false);

  const addGrupo = () => setGrupos(g => [...g, { nombre: '', presupuesto_total: '', clubes: [] }]);

  const removeGrupo = (gi: number) => setGrupos(g => g.filter((_, i) => i !== gi));

  const updateGrupo = (gi: number, field: keyof Omit<GrupoForm, 'clubes'>, value: string) =>
    setGrupos(g => g.map((gr, i) => i === gi ? { ...gr, [field]: value } : gr));

  const addClubToGrupo = (gi: number) =>
    setGrupos(g => g.map((gr, i) => i === gi ? { ...gr, clubes: [...gr.clubes, { club_id: '', cantidad_total: '' }] } : gr));

  const removeClubFromGrupo = (gi: number, ci: number) =>
    setGrupos(g => g.map((gr, i) => i === gi ? { ...gr, clubes: gr.clubes.filter((_, j) => j !== ci) } : gr));

  const updateClub = (gi: number, ci: number, field: 'club_id' | 'cantidad_total', value: string) =>
    setGrupos(g => g.map((gr, i) => i === gi
      ? { ...gr, clubes: gr.clubes.map((c, j) => j === ci ? { ...c, [field]: value } : c) }
      : gr));

  const handleNext = () => {
    if (!mes || !precioPorCamisa) { toast.error('Completá todos los campos'); return; }
    setStep(2);
  };

  const handleSubmit = async () => {
    const validGrupos = grupos.filter(g => g.nombre.trim() && g.clubes.some(c => c.club_id));
    if (validGrupos.length === 0) { toast.error('Agregá al menos un grupo con un club'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/dotacion/periodos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes,
          precio_por_camisa: precioPorCamisa,
          grupos: validGrupos.map(g => ({
            nombre: g.nombre,
            presupuesto_total: g.presupuesto_total || null,
            clubes: g.clubes.filter(c => c.club_id).map(c => ({
              club_id: c.club_id,
              cantidad_total: c.cantidad_total || null,
            })),
          })),
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Período creado');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear período');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Nuevo período de dotación</h2>
            <p className="text-xs text-slate-400 mt-0.5">Paso {step} de 2</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Mes *</label>
                <input
                  type="month"
                  value={mes}
                  onChange={e => setMes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Precio por camisa *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="6.50"
                  value={precioPorCamisa}
                  onChange={e => setPrecioPorCamisa(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {grupos.map((grupo, gi) => (
                <div key={gi} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Grupo {gi + 1}</p>
                    {grupos.length > 1 && (
                      <button onClick={() => removeGrupo(gi)} className="text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Nombre *</label>
                      <input
                        type="text"
                        placeholder="Ej: David"
                        value={grupo.nombre}
                        onChange={e => updateGrupo(gi, 'nombre', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Presupuesto total</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="100.00"
                        value={grupo.presupuesto_total}
                        onChange={e => updateGrupo(gi, 'presupuesto_total', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">Clubs en este grupo</p>
                    {grupo.clubes.map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        <select
                          value={c.club_id}
                          onChange={e => updateClub(gi, ci, 'club_id', e.target.value)}
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Seleccioná club</option>
                          {clubs.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                        </select>
                        <input
                          type="number"
                          min="1"
                          placeholder="Cant."
                          value={c.cantidad_total}
                          onChange={e => updateClub(gi, ci, 'cantidad_total', e.target.value)}
                          className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={() => removeClubFromGrupo(gi, ci)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addClubToGrupo(gi)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Agregar club
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={addGrupo}
                className="w-full border border-dashed border-slate-200 rounded-xl py-3 text-sm text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
              >
                + Agregar grupo
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-100 shrink-0">
          {step === 2 ? (
            <>
              <button onClick={() => setStep(1)} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm hover:bg-slate-50">
                Atrás
              </button>
              <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Creando...' : 'Crear período'}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleNext} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
                Siguiente
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dotacion() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'Super Administrador';
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [legacyTandas, setLegacyTandas] = useState<Tanda[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [periodosRes, tandasRes] = await Promise.all([
        apiFetch('/api/dotacion/periodos').then(r => r.json()),
        apiFetch('/api/dotacion/tandas').then(r => r.json()),
      ]);
      setPeriodos(Array.isArray(periodosRes) ? periodosRes : []);
      const legacy = (Array.isArray(tandasRes) ? tandasRes : []).filter((t: Tanda) => !t.grupo_id);
      setLegacyTandas(legacy);
    } catch { toast.error('Error al cargar datos'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    if (isSuperAdmin) {
      apiFetch('/api/clubs').then(r => r.json()).then(d => setClubs(Array.isArray(d) ? d : []));
    }
  }, [fetchData, isSuperAdmin]);

  const allAsigs = periodos.flatMap(p =>
    (p.dotacion_grupos || []).flatMap(g =>
      (g.dotacion_tandas || []).flatMap(t => t.dotacion_asignaciones || [])));
  const totalCompra = periodos.flatMap(p =>
    (p.dotacion_grupos || []).flatMap(g =>
      (g.dotacion_tandas || []).map(t => Number(t.total_compra || 0)))).reduce((s, v) => s + v, 0);
  const totalAsignado = allAsigs.reduce((s, a) => s + Number(a.monto_total), 0);
  const totalPendiente = allAsigs.filter(a => a.estado !== 'pagado').reduce((s, a) => s + Number(a.monto_total), 0);

  const hasContent = periodos.length > 0 || legacyTandas.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dotación de camisas</h1>
          <p className="text-sm text-slate-400 mt-0.5">Control de entrega y descuentos en planilla</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo período
          </button>
        )}
      </div>

      {hasContent && totalCompra > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total comprado',          value: `$${totalCompra.toFixed(2)}`,   color: 'text-slate-800' },
            { label: 'Total asignado',           value: `$${totalAsignado.toFixed(2)}`, color: 'text-slate-800' },
            { label: 'Pendiente de descontar',   value: `$${totalPendiente.toFixed(2)}`,color: 'text-amber-600' },
          ].map(item => (
            <div key={item.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-400 mb-1">{item.label}</p>
              <p className={`text-lg font-semibold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Cargando...</div>
      ) : !hasContent ? (
        <div className="text-center py-16 bg-white border border-slate-100 rounded-xl">
          <p className="text-slate-400 text-sm">No hay períodos todavía.</p>
          {isSuperAdmin && (
            <button onClick={() => setShowModal(true)} className="mt-3 text-blue-600 text-sm font-medium hover:underline">
              Crear primer período
            </button>
          )}
        </div>
      ) : (
        <>
          {periodos.map((p, i) => (
            <PeriodoSection key={p.id} periodo={p} onRefresh={fetchData} defaultOpen={i === 0} />
          ))}

          {legacyTandas.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 mb-3">Sin período</p>
              <div className="space-y-3">
                {legacyTandas.map(t => <TandaCard key={t.id} tanda={t} onRefresh={fetchData} />)}
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <NuevoPeriodoModal
          clubs={clubs}
          onClose={() => setShowModal(false)}
          onCreated={fetchData}
        />
      )}
    </div>
  );
}
