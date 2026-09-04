import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertTriangle, XCircle, Clock, Upload, ChevronRight, Download, Shirt } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { differenceInDays, parseISO } from 'date-fns';

interface DocType { id: string; name: string; has_expiry: number; is_required: number; }
interface Document {
  id: string;
  document_type_id: string;
  file_name: string;
  expiry_date: string | null;
  status: string;
  uploaded_at: string;
  document_types: { id: string; name: string; has_expiry: number } | null;
}
interface Employee {
  id: string; full_name: string; cedula: string; position: string;
  contract_type: string; contract_end: string | null;
  clubs: { name: string } | null;
}

type DocStatus = 'ok' | 'warning' | 'expired' | 'pending' | 'missing';

function getDocStatus(doc: Document | undefined, type: DocType): DocStatus {
  if (!doc) return 'missing';
  if (doc.status === 'pendiente') return 'pending';
  if (!type.has_expiry || !doc.expiry_date) return 'ok';
  const days = differenceInDays(parseISO(doc.expiry_date), new Date());
  if (days < 0) return 'expired';
  if (days <= 30) return 'warning';
  return 'ok';
}

const STATUS_CONFIG: Record<DocStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  ok:      { label: 'Al día',    icon: CheckCircle,    color: '#16a34a', bg: 'rgba(22,163,74,.1)'  },
  warning: { label: 'Por vencer', icon: AlertTriangle,  color: '#d97706', bg: 'rgba(217,119,6,.1)' },
  expired: { label: 'Vencido',   icon: XCircle,        color: '#dc2626', bg: 'rgba(220,38,38,.1)'  },
  pending: { label: 'Revisión',  icon: Clock,          color: '#7c3aed', bg: 'rgba(124,58,237,.1)' },
  missing: { label: 'Faltante',  icon: XCircle,        color: '#dc2626', bg: 'rgba(220,38,38,.1)'  },
};

interface DotacionAuth {
  id: string; descripcion: string; fecha: string; club_name: string;
  cantidad: number; cuotas: number; monto_total: number;
  estado: string; accepted_at: string; pdf_url: string | null;
}

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#d97706' },
  parcial:   { label: 'Parcial',   color: '#7c3aed' },
  pagado:    { label: 'Pagado',    color: '#16a34a' },
};

export default function EmployeeHome() {
  const { user } = useAuth();
  const [data, setData] = React.useState<{ employee: Employee; documents: Document[]; required_types: DocType[] } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [dotacion, setDotacion] = React.useState<DotacionAuth[]>([]);

  React.useEffect(() => {
    Promise.all([
      apiFetch('/api/employee/me').then(r => r.ok ? r.json() : Promise.reject('Error al cargar tu perfil')),
      apiFetch('/api/employee/dotacion').then(r => r.ok ? r.json() : []),
    ])
      .then(([profileData, dotData]) => { setData(profileData); setDotacion(dotData || []); })
      .catch(e => setError(typeof e === 'string' ? e : 'Error de conexión'))
      .finally(() => setLoading(false));
  }, []);

  const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?';

  if (loading) return (
    <div className="flex h-64 items-center justify-center text-slate-400 text-sm">Cargando...</div>
  );
  if (error) return (
    <div className="m-4 rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">{error}</div>
  );
  if (!data) return null;

  const { employee, documents, required_types } = data;
  const docMap = new Map(documents.map(d => [d.document_type_id, d]));

  const statuses = required_types.map(t => getDocStatus(docMap.get(t.id), t));
  const counts = { ok: 0, warning: 0, expired: 0, pending: 0, missing: 0 };
  statuses.forEach(s => counts[s]++);

  const hasIssues = counts.expired > 0 || counts.missing > 0;
  const hasWarnings = counts.warning > 0 || counts.pending > 0;

  return (
    <div className="p-4 space-y-4">
      {/* Welcome card */}
      <div className="rounded-2xl bg-[#0d1b3e] p-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-white/40 font-medium">Bienvenido/a</p>
            <h1 className="mt-0.5 text-[18px] font-bold leading-tight">{employee.full_name}</h1>
            <p className="mt-0.5 text-[11px] text-white/50">{employee.position} · {(employee.clubs as any)?.name ?? ''}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-[14px] font-bold">
            {initials}
          </div>
        </div>
        <div className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-semibold ${
          hasIssues ? 'bg-red-500/20 text-red-200' :
          hasWarnings ? 'bg-amber-500/20 text-amber-200' :
          'bg-emerald-500/20 text-emerald-200'
        }`}>
          <span>{hasIssues ? '⚠️ Tenés documentos vencidos o faltantes'
                           : hasWarnings ? '⏰ Algunos documentos están por vencer'
                           : '✅ Todos tus documentos están al día'}</span>
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Al día',      count: counts.ok,      color: '#16a34a' },
          { label: 'Por vencer',  count: counts.warning + counts.pending, color: '#d97706' },
          { label: 'Atención',    count: counts.expired + counts.missing, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-white border border-black/[0.06] p-3 text-center">
            <p className="text-[22px] font-extrabold" style={{ color: s.color }}>{s.count}</p>
            <p className="text-[10px] font-medium text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Document list */}
      <div className="rounded-2xl bg-white border border-black/[0.06] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.05]">
          <h2 className="text-[13px] font-bold text-slate-900">Mis Documentos</h2>
          <Link to="/mi-cuenta/documentos" className="text-[11px] font-semibold text-blue-600">
            Ver todos
          </Link>
        </div>
        {required_types.slice(0, 5).map(type => {
          const doc = docMap.get(type.id);
          const status = getDocStatus(doc, type);
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          const daysLeft = doc?.expiry_date ? differenceInDays(parseISO(doc.expiry_date), new Date()) : null;

          return (
            <div key={type.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.04] last:border-none">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: cfg.bg }}>
                <Icon className="h-4 w-4" style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-slate-900 truncate">{type.name}</p>
                <p className="text-[10.5px] text-slate-400 mt-0.5">
                  {daysLeft !== null && daysLeft >= 0 ? `Vence en ${daysLeft} días` :
                   daysLeft !== null && daysLeft < 0 ? `Venció hace ${Math.abs(daysLeft)} días` :
                   !doc ? 'No subido' : 'Sin fecha de vencimiento'}
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap"
                    style={{ color: cfg.color, background: cfg.bg }}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Dotación */}
      {dotacion.length > 0 && (
        <div className="rounded-2xl bg-white border border-black/[0.06] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-black/[0.05]">
            <Shirt className="h-4 w-4 text-slate-400" />
            <h2 className="text-[13px] font-bold text-slate-900">Mis Autorizaciones de Dotación</h2>
          </div>
          {dotacion.map(d => {
            const est = ESTADO_LABEL[d.estado] || { label: d.estado, color: '#64748b' };
            return (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.04] last:border-none">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-slate-900 truncate">{d.descripcion}</p>
                  <p className="text-[10.5px] text-slate-400 mt-0.5">
                    {d.cantidad} camisa{d.cantidad !== 1 ? 's' : ''} · ${Number(d.monto_total).toFixed(2)} · {d.cuotas} cuota{d.cuotas !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap"
                      style={{ color: est.color, background: `${est.color}18` }}>
                  {est.label}
                </span>
                {d.pdf_url && (
                  <a href={d.pdf_url} target="_blank" rel="noreferrer"
                     className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors" title="Descargar autorización">
                    <Download className="h-4 w-4" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload CTA */}
      <Link
        to="/mi-cuenta/documentos"
        className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-[13px] font-bold text-white shadow-sm shadow-blue-600/30"
      >
        <Upload className="h-4 w-4" />
        Subir o actualizar documentos
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
