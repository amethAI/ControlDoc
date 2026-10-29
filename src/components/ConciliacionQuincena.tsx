import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Download, Upload, Check, X, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type Estado =
  | 'coincide' | 'cuotas_juntas' | 'de_mas' | 'de_menos' | 'monto_distinto' | 'no_descontado'
  | 'ya_saldada' | 'falta_en_archivo' | 'desconocida' | 'datos_alterados' | 'duplicada';

interface Resultado {
  asignacion_id: string;
  cedula: string;
  nombre: string;
  estado: Estado;
  esperado: number;
  descontado: number;
  registrar: { numero: number; monto: number }[];
  aDevolver: number;
  observacion?: string;
}

interface Resumen { porEstado: Record<string, number>; cuotas: number; totalRegistrar: number; totalADevolver: number }

interface Lote {
  id: string;
  fecha_quincena: string;
  estado: 'abierto' | 'conciliado';
  conciliado_por: string | null;
  conciliado_at: string | null;
  resumen: Resumen | null;
}

interface Preview { lote: { id: string; fecha_quincena: string }; resultados: Resultado[]; resumen: Resumen }

// Orden = prioridad de revisión: primero lo que no se va a registrar o hay que devolver
const ESTADOS: Record<Estado, { label: string; color: string; orden: number }> = {
  datos_alterados:  { label: 'Cédula cambiada',         color: 'bg-red-100 text-red-700',       orden: 0 },
  desconocida:      { label: 'No existe en ControlDoc', color: 'bg-red-100 text-red-700',       orden: 1 },
  duplicada:        { label: 'Fila repetida',           color: 'bg-red-100 text-red-700',       orden: 2 },
  monto_distinto:   { label: 'El monto no cuadra',      color: 'bg-red-100 text-red-700',       orden: 3 },
  de_menos:         { label: 'Descontó de menos',       color: 'bg-red-100 text-red-700',       orden: 4 },
  de_mas:           { label: 'Descontó de más',         color: 'bg-amber-100 text-amber-700',   orden: 5 },
  ya_saldada:       { label: 'Ya estaba saldada',       color: 'bg-amber-100 text-amber-700',   orden: 6 },
  no_descontado:    { label: 'No se descontó',          color: 'bg-slate-100 text-slate-600',   orden: 7 },
  falta_en_archivo: { label: 'No vino en el archivo',   color: 'bg-slate-100 text-slate-600',   orden: 8 },
  cuotas_juntas:    { label: 'Varias cuotas',           color: 'bg-blue-100 text-blue-700',     orden: 9 },
  coincide:         { label: 'Coincide',                color: 'bg-green-100 text-green-700',   orden: 10 },
};

const money = (n: number) => `$${n.toFixed(2)}`;
const fecha = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

async function errorOf(res: Response, fallback: string) {
  try { return (await res.json()).error || fallback; } catch { return fallback; }
}

export default function ConciliacionQuincena({ onConciliada }: { onConciliada: () => void }) {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [corteActual, setCorteActual] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [busy, setBusy] = useState<'preview' | 'confirm' | 'excel' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadLotes = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dotacion/lotes');
      if (!res.ok) return;
      const data = await res.json();
      setLotes(data.lotes || []);
      setCorteActual(data.corte_actual || '');
    } catch { /* el historial es informativo; la conciliación funciona igual */ }
  }, []);

  useEffect(() => { loadLotes(); }, [loadLotes]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setRevisado(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const descargarExcel = async () => {
    setBusy('excel');
    try {
      const res = await apiFetch('/api/dotacion/lotes/actual/excel');
      if (!res.ok) { toast.error(await errorOf(res, 'No se pudo generar el Excel')); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `Conciliacion_Dotacion_${corteActual}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      loadLotes();
    } catch { toast.error('No se pudo descargar el Excel'); }
    finally { setBusy(null); }
  };

  const revisar = async (f: File) => {
    setFile(f);
    setPreview(null);
    setRevisado(false);
    setBusy('preview');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await apiFetch('/api/dotacion/conciliacion/preview', { method: 'POST', body: fd });
      if (!res.ok) { toast.error(await errorOf(res, 'No se pudo revisar el archivo')); reset(); return; }
      setPreview(await res.json());
    } catch { toast.error('No se pudo revisar el archivo'); reset(); }
    finally { setBusy(null); }
  };

  const confirmar = async () => {
    if (!file || !revisado) return;
    setBusy('confirm');
    try {
      // Se manda el mismo archivo otra vez: el servidor recalcula todo, nunca confía en montos del navegador
      const fd = new FormData();
      fd.append('file', file);
      fd.append('revisado', 'true');
      const res = await apiFetch('/api/dotacion/conciliacion/confirmar', { method: 'POST', body: fd });
      if (!res.ok) { toast.error(await errorOf(res, 'No se pudo confirmar')); return; }
      const { registradas } = await res.json();
      toast.success(registradas > 0
        ? `Quincena conciliada: ${registradas} cuota${registradas !== 1 ? 's' : ''} registrada${registradas !== 1 ? 's' : ''}`
        : 'Quincena cerrada sin pagos registrados');
      reset();
      loadLotes();
      onConciliada();
    } catch { toast.error('No se pudo confirmar'); }
    finally { setBusy(null); }
  };

  const filas = preview
    ? [...preview.resultados].sort((a, b) => ESTADOS[a.estado].orden - ESTADOS[b.estado].orden || a.nombre.localeCompare(b.nombre))
    : [];
  const atencion = filas.filter(r => ESTADOS[r.estado].orden <= 8).length;
  const loteActual = lotes.find(l => l.fecha_quincena === corteActual);

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm mb-6 overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Conciliar quincena
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Subí el Excel de la quincena con lo que se descontó en planilla. Nada se registra hasta que confirmes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {corteActual && loteActual?.estado !== 'conciliado' && (
            <button
              onClick={descargarExcel}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {busy === 'excel' ? 'Generando…' : `Excel del ${fecha(corteActual)}`}
            </button>
          )}
          <label className={`inline-flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium ${busy ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-emerald-700'}`}>
            <Upload className="h-3.5 w-3.5" />
            {busy === 'preview' ? 'Revisando…' : 'Subir Excel'}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) revisar(f); }}
            />
          </label>
        </div>
      </div>

      {preview && (
        <div className="border-t border-slate-100">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-700">
              Quincena del {fecha(preview.lote.fecha_quincena)} · <span className="text-slate-400 font-normal">{file?.name}</span>
            </p>
            <button onClick={reset} className="p-1 text-slate-400 hover:text-slate-600" title="Descartar">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-px bg-slate-100 border-y border-slate-100">
            {[
              { label: 'Cuotas a registrar', value: `${preview.resumen.cuotas} · ${money(preview.resumen.totalRegistrar)}`, color: 'text-green-700' },
              { label: 'Para revisar', value: String(atencion), color: atencion > 0 ? 'text-red-600' : 'text-slate-800' },
              { label: 'A devolver', value: money(preview.resumen.totalADevolver), color: preview.resumen.totalADevolver > 0 ? 'text-amber-600' : 'text-slate-800' },
            ].map(i => (
              <div key={i.label} className="bg-white p-3 text-center">
                <p className="text-[10px] text-slate-400 mb-0.5">{i.label}</p>
                <p className={`text-sm font-semibold tabular-nums ${i.color}`}>{i.value}</p>
              </div>
            ))}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {filas.map((r, i) => {
              const cfg = ESTADOS[r.estado];
              return (
                <div key={`${r.asignacion_id}-${i}`} className="px-4 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 truncate">{r.nombre || '(sin nombre)'}</p>
                    <p className="text-xs text-slate-400 tabular-nums">
                      {r.cedula} · esperado {money(r.esperado)} · planilla {money(r.descontado)}
                      {r.observacion && <span className="italic"> · “{r.observacion}”</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                      {r.registrar.length > 0
                        ? `Registra cuota ${r.registrar.map(c => c.numero).join(' y ')}`
                        : 'No se registra'}
                      {r.aDevolver > 0 && <span className="text-amber-600"> · devolver {money(r.aDevolver)}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 space-y-3">
            {atencion > 0 && (
              <p className="text-xs text-slate-500 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                Las filas marcadas para revisar no registran ningún pago: quedan pendientes para la próxima quincena o para corregir a mano.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input type="checkbox" checked={revisado} onChange={e => setRevisado(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Revisé los montos contra la planilla
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={reset} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!revisado || busy !== null}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
                {busy === 'confirm'
                  ? 'Registrando…'
                  : preview.resumen.cuotas > 0
                    ? `Confirmar y registrar ${preview.resumen.cuotas} cuota${preview.resumen.cuotas !== 1 ? 's' : ''}`
                    : 'Cerrar quincena sin registrar pagos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!preview && lotes.length > 0 && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {lotes.slice(0, 6).map(l => (
            <div key={l.id} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 tabular-nums">Quincena del {fecha(l.fecha_quincena)}</span>
              {l.estado === 'conciliado' ? (
                <span className="text-slate-400 text-right">
                  <span className="inline-block font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 mr-1.5">Conciliada</span>
                  {l.resumen ? `${l.resumen.cuotas} cuotas · ${money(l.resumen.totalRegistrar)}` : ''}
                  {l.conciliado_por ? ` · ${l.conciliado_por}` : ''}
                </span>
              ) : (
                <span className="inline-block font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente de conciliar</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
