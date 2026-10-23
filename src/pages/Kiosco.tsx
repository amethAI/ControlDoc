import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parseBadgeQr,
  hashBadgeCode,
  hashPin,
  nextMarkType,
  isDuplicateTap,
  MARK_SEQUENCE,
  MARK_LABEL,
  PIN_LENGTH,
  type MarkType,
} from '../lib/attendanceRules';
import { createKioskStore, type RosterEmployee, type Roster } from '../lib/kiosk/store';

const APP_VERSION = 'kiosk-1';
const SYNC_EVERY_MS = 10_000;
const ROSTER_EVERY_MS = 15 * 60_000;
const RESULT_MS = 4_000;
const NET_TIMEOUT_MS = 15_000;

const safeStorage = (() => {
  try {
    const k = '__cdk_probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  }
})();

async function netFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, credentials: 'omit' });
  } finally {
    clearTimeout(t);
  }
}

const hhmm = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('es-PA', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

type Screen =
  | { kind: 'scan'; message?: string }
  | { kind: 'pin'; emp: RosterEmployee; digits: string; error?: string }
  | { kind: 'result'; ok: boolean; title: string; detail?: string; warn?: string; emp?: RosterEmployee };

export default function Kiosco() {
  const store = useMemo(() => createKioskStore(safeStorage), []);
  const [device, setDevice] = useState(store.device());
  const [roster, setRoster] = useState<Roster | null>(store.roster());
  const [pending, setPending] = useState(store.queue().length);
  const [online, setOnline] = useState(navigator.onLine);
  const [screen, setScreen] = useState<Screen>({ kind: 'scan' });
  const [now, setNow] = useState(Date.now());
  const [facing, setFacing] = useState<'user' | 'environment'>(() => (safeStorage.getItem('cdk.facing') as any) || 'user');

  const videoRef = useRef<HTMLVideoElement>(null);
  const busyRef = useRef(false);
  const lastRosterFetch = useRef(0);
  const lastScan = useRef<{ raw: string; at: number }>({ raw: '', at: 0 });
  const tz = roster?.club.timezone || device?.club.timezone || 'America/Panama';

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { clearInterval(t); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    let lock: any = null;
    const request = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* sin wake lock */ } };
    request();
    const onVis = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.(); };
  }, []);

  const unpair = useCallback((message: string) => {
    store.saveDevice(null);
    setDevice(null);
    setScreen({ kind: 'scan', message });
  }, [store]);

  const refreshRoster = useCallback(async () => {
    const d = store.device();
    if (!d) return;
    lastRosterFetch.current = Date.now();
    try {
      const r = await netFetch('/api/kiosk/device/roster', { headers: { Authorization: `Device ${d.token}` } });
      if (r.status === 401) return unpair('Este equipo fue desvinculado. Pida un nuevo código a la administración.');
      if (!r.ok) return;
      const data: Roster = await r.json();
      store.saveRoster(data);
      setRoster(data);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [store, unpair]);

  const syncMarks = useCallback(async () => {
    const d = store.device();
    const q = store.queue();
    setPending(q.length);
    if (!d || q.length === 0) return;
    try {
      const r = await netFetch('/api/kiosk/device/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Device ${d.token}` },
        body: JSON.stringify({ device_now: new Date().toISOString(), pending: q.length, app_version: APP_VERSION, marks: q.slice(0, 100) }),
      });
      if (r.status === 401) return unpair('Este equipo fue desvinculado. Pida un nuevo código a la administración.');
      if (!r.ok) return;
      const data = await r.json();
      store.removeFromQueue([...(data.accepted || []), ...(data.rejected || []).map((x: any) => x.id)]);
      setPending(store.queue().length);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [store, unpair]);

  useEffect(() => {
    if (!device) return;
    refreshRoster();
    syncMarks();
    const s = setInterval(syncMarks, SYNC_EVERY_MS);
    const r = setInterval(refreshRoster, ROSTER_EVERY_MS);
    const back = () => { syncMarks(); refreshRoster(); };
    window.addEventListener('online', back);
    return () => { clearInterval(s); clearInterval(r); window.removeEventListener('online', back); };
  }, [device, refreshRoster, syncMarks]);

  // Cámara + lector de QR nativo (Android Chrome)
  useEffect(() => {
    if (!device || screen.kind !== 'scan') return;
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) {
      setScreen({ kind: 'scan', message: 'Este equipo no puede leer QR. Use Chrome actualizado en Android.' });
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const detector = new Detector({ formats: ['qr_code'] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 } }, audio: false });
        if (stopped) return stream.getTracks().forEach(t => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        timer = setInterval(async () => {
          if (busyRef.current || v.readyState < 2) return;
          busyRef.current = true;
          try {
            const codes = await detector.detect(v);
            if (codes.length > 0) await onQr(codes[0].rawValue);
          } catch { /* cuadro no legible */ } finally {
            busyRef.current = false;
          }
        }, 250);
      } catch {
        setScreen({ kind: 'scan', message: 'No se pudo abrir la cámara. Revise los permisos del navegador.' });
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, screen.kind, facing]);

  async function onQr(raw: string) {
    if (raw === lastScan.current.raw && Date.now() - lastScan.current.at < 6_000) return;
    lastScan.current = { raw, at: Date.now() };
    const tz = store.roster()?.club.timezone || store.device()?.club.timezone || 'America/Panama';
    const code = parseBadgeQr(raw);
    if (!code) return setScreen({ kind: 'scan', message: 'Ese QR no es un gafete de ControlDoc.' });
    const hash = await hashBadgeCode(code);
    const emp = store.roster()?.employees.find(e => e.code_hash === hash);
    if (!emp) {
      if (navigator.onLine && Date.now() - lastRosterFetch.current > 30_000) refreshRoster();
      return setScreen({ kind: 'scan', message: 'Gafete no reconocido. Si es nuevo, intente de nuevo en un minuto.' });
    }
    const locked = store.lockedUntil(emp.badge_id, Date.now());
    if (locked) return setScreen({ kind: 'result', ok: false, title: 'Gafete bloqueado', detail: `Demasiados PIN incorrectos. Intente después de las ${hhmm(locked, tz)}.` });
    setScreen({ kind: 'pin', emp, digits: '' });
  }

  async function pressDigit(d: string) {
    if (screen.kind !== 'pin') return;
    const digits = (screen.digits + d).slice(0, PIN_LENGTH);
    if (digits.length < PIN_LENGTH) return setScreen({ ...screen, digits, error: undefined });
    setScreen({ ...screen, digits });
    const emp = screen.emp;
    const ok = (await hashPin(digits, emp.pin_salt, emp.pin_iterations)) === emp.pin_hash;
    if (!ok) {
      store.pinFailed(emp.badge_id, Date.now());
      const locked = store.lockedUntil(emp.badge_id, Date.now());
      if (locked) return setScreen({ kind: 'result', ok: false, title: 'Gafete bloqueado', detail: `Demasiados PIN incorrectos. Intente después de las ${hhmm(locked, tz)}.` });
      return setScreen({ kind: 'pin', emp, digits: '', error: 'PIN incorrecto' });
    }
    store.pinOk(emp.badge_id);
    lastScan.current = { raw: lastScan.current.raw, at: Date.now() };
    registerMark(emp);
  }

  function registerMark(emp: RosterEmployee) {
    const nowMs = Date.now();
    const day = store.todayMarks(emp.employee_id, nowMs);
    const last = day.length ? day[day.length - 1] : null;
    if (last && isDuplicateTap(last.ms, nowMs)) {
      return setScreen({ kind: 'result', ok: true, emp, title: `Ya marcó ${MARK_LABEL[last.type as MarkType]}`, detail: `a las ${hhmm(last.ms, tz)}` });
    }
    const type = nextMarkType(day);
    if (!type) return setScreen({ kind: 'result', ok: true, emp, title: 'Ya completó sus 4 marcas de hoy' });
    store.enqueue({ id: crypto.randomUUID(), employee_id: emp.employee_id, badge_id: emp.badge_id, type, device_time: new Date(nowMs).toISOString() });
    setPending(store.queue().length);
    setScreen({
      kind: 'result',
      ok: true,
      emp,
      title: `${MARK_LABEL[type]} ${hhmm(nowMs, tz)}`,
      warn: emp.enabled ? undefined : `${emp.reason}. Avise a su supervisora.`,
    });
    syncMarks();
  }

  useEffect(() => {
    if (screen.kind === 'result') {
      const t = setTimeout(() => setScreen({ kind: 'scan' }), RESULT_MS);
      return () => clearTimeout(t);
    }
    if (screen.kind === 'pin') {
      const t = setTimeout(() => setScreen({ kind: 'scan' }), 30_000);
      return () => clearTimeout(t);
    }
    if (screen.kind === 'scan' && screen.message) {
      const t = setTimeout(() => setScreen({ kind: 'scan' }), 5_000);
      return () => clearTimeout(t);
    }
  }, [screen]);

  if (!device) return <PairScreen store={store} onPaired={d => { setDevice(d); setScreen({ kind: 'scan' }); }} notice={screen.kind === 'scan' ? screen.message : undefined} />;

  const dayFor = (emp?: RosterEmployee) => (emp ? store.todayMarks(emp.employee_id, Date.now()) : []);

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-slate-100 text-slate-900 flex flex-col select-none">
      <header className="bg-[#1a2e5a] text-white px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-black">Control<span className="text-rose-400">Doc</span> · {device.club.name}</div>
          <div className={`text-sm font-semibold ${online ? 'text-emerald-300' : 'text-amber-300'}`}>
            {online ? 'En línea' : 'Sin señal'}{pending > 0 ? ` · ${pending} pendiente${pending === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <div className="text-4xl font-black tabular-nums">{hhmm(now, tz)}</div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-5 gap-5">
        {screen.kind === 'scan' && (
          <>
            <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-slate-800">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined} />
              <div className="absolute inset-8 border-4 border-white/80 rounded-2xl pointer-events-none" />
            </div>
            <p className="text-2xl font-bold text-slate-800 text-center">Acerque su gafete a la cámara</p>
            {screen.message && <p className="text-lg font-semibold text-amber-700 text-center max-w-sm">{screen.message}</p>}
            <button
              onClick={() => { const f = facing === 'user' ? 'environment' : 'user'; setFacing(f); try { safeStorage.setItem('cdk.facing', f); } catch { /* */ } }}
              className="text-sm text-slate-500 underline"
            >
              Cambiar cámara
            </button>
          </>
        )}

        {screen.kind === 'pin' && (
          <div className="w-full max-w-sm flex flex-col items-center gap-5">
            <div className="text-center">
              <div className="text-xl text-slate-500 font-semibold">Hola,</div>
              <div className="text-3xl font-black text-slate-900">{screen.emp.name}</div>
            </div>
            <div className="flex gap-4">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div key={i} className={`w-6 h-6 rounded-full border-4 ${i < screen.digits.length ? 'bg-slate-900 border-slate-900' : 'border-slate-400'}`} />
              ))}
            </div>
            <div className="h-7 text-xl font-bold text-red-700">{screen.error}</div>
            <div className="grid grid-cols-3 gap-3 w-full">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                <button key={d} onClick={() => pressDigit(d)} className="h-20 rounded-2xl bg-white text-4xl font-black shadow active:bg-slate-200">{d}</button>
              ))}
              <button onClick={() => setScreen({ kind: 'scan' })} className="h-20 rounded-2xl bg-slate-200 text-lg font-bold">Cancelar</button>
              <button onClick={() => pressDigit('0')} className="h-20 rounded-2xl bg-white text-4xl font-black shadow active:bg-slate-200">0</button>
              <button onClick={() => setScreen({ ...screen, digits: screen.digits.slice(0, -1) })} className="h-20 rounded-2xl bg-slate-200 text-lg font-bold">Borrar</button>
            </div>
          </div>
        )}

        {screen.kind === 'result' && (
          <div className={`w-full max-w-sm rounded-3xl p-6 ${!screen.ok ? 'bg-red-100' : screen.warn ? 'bg-amber-100' : 'bg-emerald-100'}`}>
            {screen.emp && <div className="text-2xl font-black text-slate-900 mb-1">{screen.emp.name}</div>}
            <div className={`text-3xl font-black ${!screen.ok ? 'text-red-800' : screen.warn ? 'text-amber-800' : 'text-emerald-800'}`}>
              {screen.ok ? '✓ ' : ''}{screen.title}
            </div>
            {screen.detail && <div className="mt-2 text-xl font-semibold text-slate-700">{screen.detail}</div>}
            {screen.warn && <div className="mt-3 text-xl font-bold text-amber-900">{screen.warn}</div>}
            {screen.emp && (
              <ul className="mt-5 space-y-2">
                {MARK_SEQUENCE.map(t => {
                  const m = dayFor(screen.emp).find(x => x.type === t);
                  return (
                    <li key={t} className={`flex justify-between text-xl ${m ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                      <span>{m ? '●' : '○'} {MARK_LABEL[t]}</span>
                      <span className="tabular-nums">{m ? hhmm(m.ms, tz) : '—'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function PairScreen({ store, onPaired, notice }: { store: ReturnType<typeof createKioskStore>; onPaired: (d: any) => void; notice?: string }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(notice || '');
  const [busy, setBusy] = useState(false);

  async function pair() {
    if (!/^\d{6}$/.test(code)) return setError('El código tiene 6 dígitos.');
    setBusy(true);
    setError('');
    try {
      const r = await netFetch('/api/kiosk/device/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setError(data.error || 'No se pudo vincular.');
      const d = { token: data.token, device: data.device, club: data.club };
      store.saveDevice(d);
      onPaired(d);
    } catch {
      setError('Sin conexión. La vinculación necesita internet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-slate-100 text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow p-6 flex flex-col gap-4">
        <div className="text-2xl font-black">Control<span className="text-rose-600">Doc</span> · Vincular equipo</div>
        <p className="text-slate-600">Ingrese el código de 6 dígitos que generó la administración para este club.</p>
        <input
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center text-4xl tracking-[0.4em] font-black border-2 border-slate-300 rounded-2xl py-3 bg-white text-slate-900 placeholder:text-slate-300"
          placeholder="••••••"
        />
        {error && <p className="text-red-700 font-semibold">{error}</p>}
        <button disabled={busy} onClick={pair} className="h-14 rounded-2xl bg-[#1a2e5a] text-white text-xl font-bold disabled:opacity-50">
          {busy ? 'Vinculando…' : 'Vincular'}
        </button>
      </div>
    </div>
  );
}
