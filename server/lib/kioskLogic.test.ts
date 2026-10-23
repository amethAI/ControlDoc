import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBadgeQr, formatBadgeQr } from '../../src/lib/attendanceRules.ts';
import {
  generateBadgeCode,
  generatePin,
  isWeakPin,
  generateDeviceToken,
  hashToken,
  generatePairingCode,
  markBatchSchema,
  computeMarkFlags,
  readDeviceToken,
  employeeEnablement,
} from './kioskLogic.ts';

test('habilitada: sin vencimientos', () => {
  assert.deepEqual(employeeEnablement({ contract_type: 'Indefinido', contract_end: null, cr_carne_vencimiento: '2029-01-01', expiredDocNames: [] }, '2026-10-23'), { enabled: true, reason: null });
});

test('no habilitada: carné de CR vencido, documento vencido o contrato definido vencido', () => {
  assert.deepEqual(employeeEnablement({ contract_type: 'Indefinido', contract_end: null, cr_carne_vencimiento: '2026-10-01', expiredDocNames: [] }, '2026-10-23'), { enabled: false, reason: 'Carné vencido' });
  assert.deepEqual(employeeEnablement({ contract_type: 'Definido', contract_end: null, cr_carne_vencimiento: null, expiredDocNames: ['Carnet verde'] }, '2026-10-23'), { enabled: false, reason: 'Carnet verde vencido' });
  assert.deepEqual(employeeEnablement({ contract_type: 'Definido', contract_end: '2026-10-20', cr_carne_vencimiento: null, expiredDocNames: [] }, '2026-10-23'), { enabled: false, reason: 'Contrato vencido' });
  assert.equal(employeeEnablement({ contract_type: 'Indefinido', contract_end: '2026-10-20', cr_carne_vencimiento: null, expiredDocNames: [] }, '2026-10-23').enabled, true);
});

const at = (iso: string) => new Date(iso).getTime();

test('el código del gafete es válido para el lector y nunca se repite', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = generateBadgeCode();
    assert.equal(parseBadgeQr(formatBadgeQr(code)), code);
    seen.add(code);
  }
  assert.equal(seen.size, 200);
});

test('PIN de 4 dígitos que no es débil', () => {
  for (let i = 0; i < 300; i++) {
    const pin = generatePin();
    assert.match(pin, /^\d{4}$/);
    assert.equal(isWeakPin(pin), false);
  }
});

test('PIN débiles detectados', () => {
  for (const p of ['0000', '1111', '1234', '4321', '6789', '9876', '0123', '1212', '2580']) {
    assert.equal(isWeakPin(p), true, p);
  }
  assert.equal(isWeakPin('4821'), false);
});

test('clave del equipo: aleatoria y se guarda solo su hash', () => {
  const a = generateDeviceToken();
  const b = generateDeviceToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 43);
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(a), hashToken(a));
});

test('código de vinculación de 6 dígitos', () => {
  assert.match(generatePairingCode(), /^\d{6}$/);
});

test('la clave del equipo se lee del header Authorization: Device <token>', () => {
  assert.equal(readDeviceToken('Device abc.def'), 'abc.def');
  assert.equal(readDeviceToken('Bearer abc'), null);
  assert.equal(readDeviceToken(undefined), null);
});

const mark = (over: Partial<any> = {}) => ({
  id: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  employee_id: 'emp-1',
  badge_id: '9a8b7c6d-5e4f-4a3b-9c1d-0e1f2a3b4c5d',
  type: 'entrada',
  device_time: '2026-10-23T13:58:00.000Z',
  ...over,
});

test('lote válido pasa; lote de más de 100 o con tipo inválido se rechaza', () => {
  assert.equal(markBatchSchema.safeParse({ device_now: '2026-10-23T14:00:00.000Z', marks: [mark()] }).success, true);
  assert.equal(markBatchSchema.safeParse({ device_now: '2026-10-23T14:00:00.000Z', marks: Array(101).fill(mark()) }).success, false);
  assert.equal(markBatchSchema.safeParse({ device_now: '2026-10-23T14:00:00.000Z', marks: [mark({ type: 'otra' })] }).success, false);
  assert.equal(markBatchSchema.safeParse({ device_now: 'ayer', marks: [mark()] }).success, false);
  assert.equal(markBatchSchema.safeParse({ device_now: '2026-10-23T14:00:00.000Z', marks: [mark({ id: 'no-uuid' })] }).success, false);
});

test('marca normal sin banderas', () => {
  assert.deepEqual(computeMarkFlags({ type: 'entrada', markedMs: at('2026-10-23T13:58:00Z'), dayMarks: [], employeeEnabled: true, badgeRevoked: false, drifted: false }), []);
});

test('banderas: reloj, gafete anulado, documentos', () => {
  const f = computeMarkFlags({ type: 'entrada', markedMs: at('2026-10-23T13:58:00Z'), dayMarks: [], employeeEnabled: false, badgeRevoked: true, drifted: true });
  assert.deepEqual(f.sort(), ['docs_vencidos', 'gafete_anulado', 'reloj_desfasado']);
});

test('bandera duplicada y fuera de orden', () => {
  assert.ok(computeMarkFlags({ type: 'entrada', markedMs: at('2026-10-23T15:00:00Z'), dayMarks: [{ type: 'entrada', markedMs: at('2026-10-23T13:58:00Z') }], employeeEnabled: true, badgeRevoked: false, drifted: false }).includes('duplicada'));
  assert.ok(computeMarkFlags({ type: 'salida', markedMs: at('2026-10-23T22:00:00Z'), dayMarks: [{ type: 'entrada', markedMs: at('2026-10-23T13:58:00Z') }], employeeEnabled: true, badgeRevoked: false, drifted: false }).includes('fuera_de_orden'));
});

test('bandera almuerzo largo al registrar el regreso', () => {
  const day = [{ type: 'entrada', markedMs: at('2026-10-23T13:58:00Z') }, { type: 'salida_almuerzo', markedMs: at('2026-10-23T18:00:00Z') }];
  assert.ok(computeMarkFlags({ type: 'regreso_almuerzo', markedMs: at('2026-10-23T19:15:00Z'), dayMarks: day, employeeEnabled: true, badgeRevoked: false, drifted: false }).includes('almuerzo_largo'));
  assert.deepEqual(computeMarkFlags({ type: 'regreso_almuerzo', markedMs: at('2026-10-23T18:55:00Z'), dayMarks: day, employeeEnabled: true, badgeRevoked: false, drifted: false }), []);
});
