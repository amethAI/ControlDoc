import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MARK_SEQUENCE, MARK_LABEL } from '../lib/attendanceRules';

interface Club { id: string; name: string; country: string | null }
interface Mark { id: string; employee_id: string; mark_type: string; marked_at: string; flags: string[] }
interface Device { id: string; name: string; last_seen_at: string | null; last_pending: number | null; paired_at: string | null }
interface MarksView { club: { id: string; name: string; timezone: string }; date: string; employees: { id: string; full_name: string }[]; marks: Mark[]; devices: Device[] }
interface IssuedBadge { employee_id: string; full_name: string; qr: string; pin: string }

const FLAG_LABEL: Record<string, string> = {
  reloj_desfasado: 'Reloj del equipo desfasado',
  gafete_anulado: 'Gafete anulado',
  docs_vencidos: 'Documentos vencidos',
  duplicada: 'Marca repetida',
  fuera_de_orden: 'Fuera de orden',
  almuerzo_largo: 'Almuerzo de más de 60 min',
  otro_club: 'Marcó en otro club',
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const localToday = () => new Date().toLocaleDateString('en-CA');

function sinceLabel(iso: string | null) {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

async function printBadges(clubName: string, badges: IssuedBadge[]) {
  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) return toast.error('El navegador bloqueó la ventana de impresión. Permita ventanas emergentes.');
  const imgs = await Promise.all(badges.map(b => QRCode.toDataURL(b.qr, { errorCorrectionLevel: 'M', margin: 1, width: 360 })));
  const labels = badges.map((b, i) => `
    <div class="label"><img src="${imgs[i]}" alt=""><div class="name">${esc(b.full_name)}</div><div class="club">${esc(clubName)}</div></div>`).join('');
  const pins = badges.map(b => `<tr><td>${esc(b.full_name)}</td><td class="pin">${b.pin}</td><td class="cut">Firma de recibido: ______________</td></tr>`).join('');
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Gafetes · ${esc(clubName)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #16213a; }
      h1 { font-size: 18px; margin: 0 0 10px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
      .label { border: 1px dashed #94a3b8; border-radius: 6px; padding: 4mm; text-align: center; break-inside: avoid; }
      .label img { width: 42mm; height: 42mm; }
      .name { font-weight: 800; font-size: 13px; margin-top: 2mm; }
      .club { font-size: 11px; color: #5b6475; }
      .page-break { break-before: page; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      td { border-bottom: 1px solid #cbd5e1; padding: 8px 4px; }
      .pin { font-size: 22px; font-weight: 800; letter-spacing: 4px; width: 90px; }
      .warn { color: #b91c1c; font-weight: 700; margin-bottom: 8px; }
    </style></head><body>
    <h1>Etiquetas QR · ${esc(clubName)} · pegar atrás del gafete</h1>
    <div class="grid">${labels}</div>
    <div class="page-break"></div>
    <h1>PIN de marcación · ${esc(clubName)}</h1>
    <div class="warn">CONFIDENCIAL — recortar y entregar a cada persona en privado. No se puede volver a consultar: si se pierde, se genera uno nuevo.</div>
    <table>${pins}</table>
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

export default function Marcaciones() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Administrador' || user?.role === 'Super Administrador';
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState('');
  const [date, setDate] = useState(localToday());
  const [view, setView] = useState<MarksView | null>(null);
  const [loading, setLoading] = useState(false);
  const [newDevice, setNewDevice] = useState('');
  const [pairing, setPairing] = useState<{ name: string; code: string; expires: string } | null>(null);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await apiFetch('/api/clubs');
      if (!r.ok) return;
      const all: Club[] = await r.json();
      const real = all.filter(c => c.country && c.id !== 'global' && c.id !== 'hr');
      setClubs(real);
      setClubId(prev => prev || (user?.club_id && real.some(c => c.id === user.club_id) ? user.club_id : real[0]?.id) || '');
    })();
  }, [user?.club_id]);

  const load = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/attendance-marks?club_id=${encodeURIComponent(clubId)}&date=${date}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error');
      setView(await r.json());
    } catch (e: any) {
      toast.error(e.message || 'No se pudieron cargar las marcaciones');
    } finally {
      setLoading(false);
    }
  }, [clubId, date]);

  useEffect(() => { load(); }, [load]);

  const tz = view?.club.timezone || 'America/Panama';
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-PA', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const isPastDay = date < localToday();

  const rows = useMemo(() => {
    if (!view) return [];
    return view.employees.map(e => {
      const marks = view.marks.filter(m => m.employee_id === e.id);
      const byType = Object.fromEntries(MARK_SEQUENCE.map(t => [t, marks.find(m => m.mark_type === t)]));
      const flags = new Set(marks.flatMap(m => m.flags));
      const alerts = [...flags].map(f => FLAG_LABEL[f] || f);
      if (isPastDay && byType.entrada && !byType.salida) alerts.push('Sin marca de salida');
      return { e, byType, alerts, any: marks.length > 0 };
    });
  }, [view, isPastDay]);

  const present = rows.filter(r => r.byType.entrada).length;

  async function createDevice() {
    if (!newDevice.trim()) return;
    const r = await apiFetch('/api/kiosk/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ club_id: clubId, name: newDevice.trim() }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data.error || 'No se pudo crear el equipo');
    setPairing({ name: data.name, code: data.pairing_code, expires: data.pairing_expires_at });
    setNewDevice('');
    load();
  }

  async function repair(d: Device) {
    if (!confirm(`¿Generar un código nuevo para "${d.name}"? El equipo deja de funcionar hasta que se vuelva a vincular.`)) return;
    const r = await apiFetch(`/api/kiosk/devices/${d.id}/pairing-code`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data.error || 'Error');
    setPairing({ name: d.name, code: data.pairing_code, expires: data.pairing_expires_at });
    load();
  }

  async function revoke(d: Device) {
    if (!confirm(`¿Revocar "${d.name}"? No podrá volver a marcar.`)) return;
    const r = await apiFetch(`/api/kiosk/devices/${d.id}`, { method: 'DELETE' });
    if (!r.ok) return toast.error('No se pudo revocar');
    toast.success('Equipo revocado');
    load();
  }

  async function issue(employeeIds?: string[]) {
    const target = employeeIds ? 'esta persona' : `todo el personal activo de ${view?.club.name}`;
    if (!confirm(`¿Emitir gafetes nuevos para ${target}? Los QR y PIN anteriores dejan de funcionar.`)) return;
    setIssuing(true);
    try {
      const r = await apiFetch(`/api/clubs/${clubId}/badges`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(employeeIds ? { employee_ids: employeeIds } : {}) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(data.error || 'No se pudieron emitir');
      await printBadges(data.club, data.badges);
      toast.success(`${data.badges.length} gafete(s) emitidos. Los equipos los reciben en su próxima actualización.`);
    } finally {
      setIssuing(false);
    }
  }

  async function resetPin(empId: string) {
    if (!confirm('¿Generar un PIN nuevo? El anterior deja de funcionar.')) return;
    const r = await apiFetch(`/api/employees/${empId}/badge/pin`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(data.error || 'No se pudo resetear');
    alert(`Nuevo PIN de ${data.full_name}: ${data.pin}\n\nEntréguelo en privado. No se puede volver a consultar.`);
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marcaciones</h1>
          <p className="text-slate-500 mt-1">Entrada, almuerzo y salida registradas en el equipo de cada club.</p>
        </div>
        <div className="flex gap-3">
          <select value={clubId} onChange={e => setClubId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm">
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={date} max={localToday()} onChange={e => setDate(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm" />
        </div>
      </div>

      {view && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-4 items-center">
          <div className="text-sm text-slate-600"><span className="text-2xl font-bold text-slate-900">{present}</span> / {view.employees.length} con entrada</div>
          <div className="flex-1" />
          {view.devices.length === 0 && <span className="text-sm text-amber-700 font-semibold">Este club no tiene equipo de marcación vinculado.</span>}
          {view.devices.map(d => {
            const stale = !d.last_seen_at || Date.now() - Date.parse(d.last_seen_at) > 30 * 60000;
            return (
              <div key={d.id} className={`text-sm px-3 py-2 rounded-lg ${stale ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                <b>{d.name}</b> · {d.paired_at ? `visto ${sinceLabel(d.last_seen_at)}` : 'sin vincular'}
                {d.last_pending ? ` · ${d.last_pending} pendiente(s)` : ''}
                {isAdmin && (
                  <span className="ml-2">
                    <button onClick={() => repair(d)} className="underline mr-2">Nuevo código</button>
                    <button onClick={() => revoke(d)} className="underline text-red-700">Revocar</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">Nombre</th>
              {MARK_SEQUENCE.map(t => <th key={t} className="px-3 py-3">{MARK_LABEL[t]}</th>)}
              <th className="text-left px-4 py-3">Alertas</th>
              {isAdmin && <th className="px-3 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>}
            {!loading && rows.map(({ e, byType, alerts }) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-800">{e.full_name}</td>
                {MARK_SEQUENCE.map(t => (
                  <td key={t} className="px-3 py-2 text-center tabular-nums">{byType[t] ? hhmm(byType[t]!.marked_at) : <span className="text-slate-300">—</span>}</td>
                ))}
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {alerts.map(a => <span key={a} className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-semibold">{a}</span>)}
                  </div>
                </td>
                {isAdmin && (
                  <td className="px-3 py-2 text-right whitespace-nowrap text-xs">
                    <button onClick={() => issue([e.id])} className="underline text-slate-600 mr-2">Reemitir gafete</button>
                    <button onClick={() => resetPin(e.id)} className="underline text-slate-600">Nuevo PIN</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && view && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-bold text-slate-900">Gafetes de {view.club.name}</h2>
            <p className="text-sm text-slate-600">Genera las etiquetas QR para pegar atrás del gafete y la hoja confidencial de PIN. Los gafetes anteriores del club dejan de funcionar.</p>
            <button disabled={issuing} onClick={() => issue()} className="px-4 py-2 rounded-lg bg-[#1a2e5a] text-white text-sm font-semibold disabled:opacity-50">
              {issuing ? 'Emitiendo…' : 'Emitir e imprimir gafetes del club'}
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-bold text-slate-900">Nuevo equipo de marcación</h2>
            <div className="flex gap-2">
              <input value={newDevice} onChange={e => setNewDevice(e.target.value)} placeholder="Ej.: Celular entrada" maxLength={60} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <button onClick={createDevice} className="px-4 py-2 rounded-lg bg-[#1a2e5a] text-white text-sm font-semibold">Crear</button>
            </div>
          </div>
        </div>
      )}

      {pairing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setPairing(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Vincular "{pairing.name}"</h3>
            <ol className="text-sm text-slate-700 list-decimal pl-5 space-y-1">
              <li>En el celular del club, abra Chrome en <b>{window.location.origin}/kiosco</b></li>
              <li>Ingrese este código:</li>
            </ol>
            <div className="text-5xl font-black tracking-[0.3em] text-center py-2">{pairing.code}</div>
            <p className="text-xs text-slate-500 text-center">Vence a las {new Date(pairing.expires).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' })}. Solo funciona una vez.</p>
            <button onClick={() => setPairing(null)} className="w-full py-2 rounded-lg bg-slate-100 font-semibold">Listo</button>
          </div>
        </div>
      )}
    </div>
  );
}
