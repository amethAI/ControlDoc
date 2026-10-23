import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKioskStore, type KVStorage, type QueuedMark, type Roster } from './store.ts';

function memory(): KVStorage {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k) };
}

const qm = (over: Partial<QueuedMark> = {}): QueuedMark => ({
  id: crypto.randomUUID(),
  employee_id: 'e1',
  badge_id: 'b1',
  type: 'entrada',
  device_time: '2026-10-23T13:58:00.000Z',
  ...over,
});

const roster = (today: { id: string; type: string; marked_at: string }[] = []): Roster => ({
  server_time: '2026-10-23T14:00:00.000Z',
  work_date: '2026-10-23',
  club: { id: 'c1', name: 'Metropark', timezone: 'America/Panama' },
  lunch_limit_min: 60,
  employees: [{ employee_id: 'e1', name: 'MARÍA', badge_id: 'b1', code_hash: 'h', pin_hash: 'p', pin_salt: 's', pin_iterations: 1, enabled: true, reason: null, today }],
});

test('la cola sobrevive y se vacía solo por lo confirmado', () => {
  const st = memory();
  const a = createKioskStore(st);
  const m1 = qm(), m2 = qm({ type: 'salida_almuerzo' });
  a.enqueue(m1);
  a.enqueue(m2);
  const b = createKioskStore(st);
  assert.equal(b.queue().length, 2);
  b.removeFromQueue([m1.id]);
  assert.deepEqual(b.queue().map(m => m.id), [m2.id]);
});

test('marcas del día = las del servidor + las pendientes en cola de ese día', () => {
  const s = createKioskStore(memory());
  s.saveRoster(roster([{ id: 'srv-1', type: 'entrada', marked_at: '2026-10-23T13:58:00.000Z' }]));
  s.enqueue(qm({ type: 'salida_almuerzo', device_time: '2026-10-23T18:00:00.000Z' }));
  s.enqueue(qm({ type: 'entrada', device_time: '2026-10-22T13:58:00.000Z' }));
  const day = s.todayMarks('e1', Date.parse('2026-10-23T19:00:00Z'));
  assert.deepEqual(day.map(d => d.type), ['entrada', 'salida_almuerzo']);
});

test('una lista de otro día no cuenta como marcas de hoy', () => {
  const s = createKioskStore(memory());
  s.saveRoster(roster([{ id: 'srv-0', type: 'entrada', marked_at: '2026-10-22T13:58:00.000Z' }]));
  assert.deepEqual(s.todayMarks('e1', Date.parse('2026-10-23T14:00:00Z')), []);
});

test('una marca ya enviada sigue contando aunque la lista del club todavía no la tenga', () => {
  const s = createKioskStore(memory());
  s.saveRoster(roster([]));
  const m = qm({ device_time: '2026-10-23T13:58:00.000Z' });
  s.enqueue(m);
  s.removeFromQueue([m.id]);
  assert.deepEqual(s.todayMarks('e1', Date.parse('2026-10-23T14:00:00Z')).map(d => d.type), ['entrada']);
  s.saveRoster(roster([{ id: m.id, type: 'entrada', marked_at: m.device_time }]));
  assert.equal(s.todayMarks('e1', Date.parse('2026-10-23T14:00:00Z')).length, 1);
});

test('5 PIN incorrectos bloquean ese gafete 10 minutos; un acierto limpia', () => {
  const s = createKioskStore(memory());
  const t0 = Date.parse('2026-10-23T14:00:00Z');
  for (let i = 0; i < 4; i++) s.pinFailed('b1', t0);
  assert.equal(s.lockedUntil('b1', t0), null);
  s.pinFailed('b1', t0);
  assert.equal(s.lockedUntil('b1', t0 + 60_000), t0 + 10 * 60_000);
  assert.equal(s.lockedUntil('b1', t0 + 10 * 60_000 + 1), null);
  s.pinFailed('b2', t0);
  s.pinOk('b2');
  assert.equal(s.lockedUntil('b2', t0), null);
});

test('si el almacenamiento falla, el kiosco sigue funcionando en memoria', () => {
  const broken: KVStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  const s = createKioskStore(broken);
  s.enqueue(qm());
  assert.equal(s.queue().length, 1);
});
