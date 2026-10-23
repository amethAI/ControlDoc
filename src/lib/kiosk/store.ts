import { workDate, MAX_PIN_ATTEMPTS, PIN_LOCK_MS, type MarkType } from '../attendanceRules.ts';

export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeviceConfig {
  token: string;
  device: { id: string; name: string };
  club: { id: string; name: string; timezone: string };
}

export interface RosterEmployee {
  employee_id: string;
  name: string;
  badge_id: string;
  code_hash: string;
  pin_hash: string;
  pin_salt: string;
  pin_iterations: number;
  enabled: boolean;
  reason: string | null;
  today: { id: string; type: string; marked_at: string }[];
}

export interface Roster {
  server_time: string;
  work_date: string;
  club: { id: string; name: string; timezone: string };
  lunch_limit_min: number;
  employees: RosterEmployee[];
}

export interface QueuedMark {
  id: string;
  employee_id: string;
  badge_id: string;
  type: MarkType;
  device_time: string;
}

export interface DayMark {
  id: string;
  type: string;
  ms: number;
}

const K = { device: 'cdk.device', roster: 'cdk.roster', queue: 'cdk.queue', sent: 'cdk.sent', pins: 'cdk.pins' };
const SENT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

// Escribe en memoria y en el almacenamiento; si el almacenamiento falla, el kiosco sigue con lo de memoria
export function createKioskStore(storage: KVStorage) {
  const mem = new Map<string, unknown>();

  function read<T>(key: string, fallback: T): T {
    if (mem.has(key)) return mem.get(key) as T;
    let value = fallback;
    try {
      const raw = storage.getItem(key);
      if (raw) value = JSON.parse(raw) as T;
    } catch { /* almacenamiento no disponible */ }
    mem.set(key, value);
    return value;
  }

  function write(key: string, value: unknown) {
    mem.set(key, value);
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch { /* almacenamiento no disponible */ }
  }

  const timezone = () => read<Roster | null>(K.roster, null)?.club.timezone || read<DeviceConfig | null>(K.device, null)?.club.timezone || 'America/Panama';

  return {
    device: () => read<DeviceConfig | null>(K.device, null),
    saveDevice: (d: DeviceConfig | null) => write(K.device, d),

    roster: () => read<Roster | null>(K.roster, null),
    saveRoster: (r: Roster) => write(K.roster, r),

    queue: () => read<QueuedMark[]>(K.queue, []),
    enqueue(m: QueuedMark) {
      write(K.queue, [...read<QueuedMark[]>(K.queue, []), m]);
    },
    removeFromQueue(ids: string[]) {
      if (ids.length === 0) return;
      const drop = new Set(ids);
      const q = read<QueuedMark[]>(K.queue, []);
      const cutoff = Date.now() - SENT_RETENTION_MS;
      const sent = read<QueuedMark[]>(K.sent, []).filter(m => Date.parse(m.device_time) > cutoff);
      write(K.sent, [...sent, ...q.filter(m => drop.has(m.id))]);
      write(K.queue, q.filter(m => !drop.has(m.id)));
    },

    // Marcas de hoy de una persona: servidor + ya enviadas + pendientes, sin duplicar
    todayMarks(employeeId: string, nowMs: number): DayMark[] {
      const tz = timezone();
      const today = workDate(nowMs, tz);
      const byId = new Map<string, DayMark>();
      const r = read<Roster | null>(K.roster, null);
      if (r && r.work_date === today) {
        for (const m of r.employees.find(e => e.employee_id === employeeId)?.today || []) {
          const ms = Date.parse(m.marked_at);
          if (workDate(ms, tz) === today) byId.set(m.id, { id: m.id, type: m.type, ms });
        }
      }
      const local = [...read<QueuedMark[]>(K.sent, []), ...read<QueuedMark[]>(K.queue, [])];
      for (const m of local) {
        const ms = Date.parse(m.device_time);
        if (m.employee_id === employeeId && workDate(ms, tz) === today && !byId.has(m.id)) byId.set(m.id, { id: m.id, type: m.type, ms });
      }
      return [...byId.values()].sort((a, b) => a.ms - b.ms);
    },

    pinFailed(badgeId: string, nowMs: number) {
      const pins = read<Record<string, { fails: number; lockedUntil: number | null }>>(K.pins, {});
      const cur = pins[badgeId] || { fails: 0, lockedUntil: null };
      const fails = cur.fails + 1;
      write(K.pins, { ...pins, [badgeId]: fails >= MAX_PIN_ATTEMPTS ? { fails: 0, lockedUntil: nowMs + PIN_LOCK_MS } : { fails, lockedUntil: cur.lockedUntil } });
    },
    pinOk(badgeId: string) {
      const pins = { ...read<Record<string, unknown>>(K.pins, {}) };
      delete pins[badgeId];
      write(K.pins, pins);
    },
    lockedUntil(badgeId: string, nowMs: number): number | null {
      const until = read<Record<string, { lockedUntil: number | null }>>(K.pins, {})[badgeId]?.lockedUntil ?? null;
      return until !== null && nowMs < until ? until : null;
    },
  };
}

export type KioskStore = ReturnType<typeof createKioskStore>;
