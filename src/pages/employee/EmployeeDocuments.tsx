import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Clock, Upload, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface DocType { id: string; name: string; has_expiry: number; is_required: number; }
interface Document {
  id: string; document_type_id: string; file_name: string;
  expiry_date: string | null; status: string; uploaded_at: string;
  document_types: { id: string; name: string; has_expiry: number } | null;
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
  ok:      { label: 'Al día',     icon: CheckCircle,   color: '#16a34a', bg: 'rgba(22,163,74,.1)'   },
  warning: { label: 'Por vencer', icon: AlertTriangle,  color: '#d97706', bg: 'rgba(217,119,6,.1)'  },
  expired: { label: 'Vencido',    icon: XCircle,        color: '#dc2626', bg: 'rgba(220,38,38,.1)'  },
  pending: { label: 'En revisión',icon: Clock,          color: '#7c3aed', bg: 'rgba(124,58,237,.1)' },
  missing: { label: 'Faltante',   icon: XCircle,        color: '#dc2626', bg: 'rgba(220,38,38,.1)'  },
};

export default function EmployeeDocuments() {
  const [data, setData] = React.useState<{ documents: Document[]; required_types: DocType[] } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [modal, setModal] = React.useState<{ typeId: string; typeName: string; hasExpiry: boolean } | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [expiryDate, setExpiryDate] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    apiFetch('/api/employee/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData({ documents: d.documents, required_types: d.required_types }))
      .catch(() => toast.error('Error al cargar documentos'))
      .finally(() => setLoading(false));
  };

  React.useEffect(load, []);

  const openModal = (type: DocType) => {
    setFile(null);
    setExpiryDate('');
    setModal({ typeId: type.id, typeName: type.name, hasExpiry: !!type.has_expiry });
  };

  const handleUpload = async () => {
    if (!file || !modal) return;
    if (modal.hasExpiry && !expiryDate) {
      toast.error('Ingresá la fecha de vencimiento');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('document_type_id', modal.typeId);
      if (expiryDate) form.append('expiry_date', expiryDate);

      const res = await apiFetch('/api/employee/documents/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al subir');
      }
      toast.success('Documento enviado para revisión');
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Error al subir el documento');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center text-slate-400 text-sm">Cargando...</div>
  );
  if (!data) return null;

  const { documents, required_types } = data;
  const docMap = new Map(documents.map(d => [d.document_type_id, d]));

  return (
    <div className="p-4">
      <h1 className="text-[17px] font-bold text-slate-900 mb-4">Mis Documentos</h1>

      <div className="space-y-3">
        {required_types.map(type => {
          const doc = docMap.get(type.id);
          const status = getDocStatus(doc, type);
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          const daysLeft = doc?.expiry_date ? differenceInDays(parseISO(doc.expiry_date), new Date()) : null;

          return (
            <div key={type.id} className="rounded-2xl bg-white border border-black/[0.06] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: cfg.bg }}>
                  <Icon className="h-4.5 w-4.5" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-bold text-slate-900">{type.name}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                          style={{ color: cfg.color, background: cfg.bg }}>
                      {cfg.label}
                    </span>
                  </div>
                  {doc && (
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{doc.file_name}</p>
                  )}
                  {daysLeft !== null && (
                    <p className="text-[11px] mt-0.5" style={{ color: cfg.color }}>
                      {daysLeft >= 0 ? `Vence en ${daysLeft} días` : `Venció hace ${Math.abs(daysLeft)} días`}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => openModal(type)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.07] bg-slate-50 py-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
              >
                <Upload className="h-3.5 w-3.5" />
                {doc ? 'Actualizar documento' : 'Subir documento'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Upload modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-bold text-slate-900">{modal.typeName}</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* File picker */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx"
              capture="environment"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />

            {file ? (
              <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 p-3 mb-3">
                <CheckCircle className="h-5 w-5 text-blue-600 shrink-0" />
                <p className="text-[12px] font-medium text-blue-800 truncate">{file.name}</p>
                <button onClick={() => setFile(null)} className="ml-auto text-blue-400 hover:text-blue-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center cursor-pointer hover:border-blue-300 mb-3"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-[12px] font-semibold text-slate-500">Tocá para seleccionar</p>
                <p className="text-[10.5px] text-slate-400 mt-1">Foto, PDF, DOC — máx 10MB</p>
              </div>
            )}

            {modal.hasExpiry && (
              <div className="mb-4">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Fecha de vencimiento
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 focus:outline-none focus:border-blue-400"
                />
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-[13px] font-bold text-white disabled:opacity-50 hover:bg-blue-700"
            >
              {uploading ? 'Subiendo...' : 'Enviar para revisión'}
            </button>
            <p className="mt-2 text-center text-[10.5px] text-slate-400">
              RRHH revisará y aprobará el documento
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
