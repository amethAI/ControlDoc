import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createHash } from 'node:crypto';
import {
  MARK_SEQUENCE,
  nextMarkType,
  isDuplicateTap,
  lunchExceeded,
  clockDrifted,
  workDate,
  parseBadgeQr,
  formatBadgeQr,
  hashPin,
  hashBadgeCode,
  PIN_ITERATIONS,
} from './attendanceRules.ts';

const at = (iso: string) => new Date(iso).getTime();

test('la secuencia del día es entrada → salida almuerzo → regreso → salida', () => {
  assert.deepEqual(MARK_SEQUENCE, ['entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida']);
  assert.equal(nextMarkType([]), 'entrada');
  assert.equal(nextMarkType([{ type: 'entrada' }]), 'salida_almuerzo');
  assert.equal(nextMarkType([{ type: 'entrada' }, { type: 'salida_almuerzo' }]), 'regreso_almuerzo');
  assert.equal(nextMarkType([{ type: 'entrada' }, { type: 'salida_almuerzo' }, { type: 'regreso_almuerzo' }]), 'salida');
});

test('con las 4 marcas hechas no hay próxima marca', () => {
  assert.equal(nextMarkType(MARK_SEQUENCE.map(type => ({ type }))), null);
});

test('un doble toque dentro de 2 minutos se ignora', () => {
  assert.equal(isDuplicateTap(at('2026-10-23T13:58:00Z'), at('2026-10-23T13:59:30Z')), true);
  assert.equal(isDuplicateTap(at('2026-10-23T13:58:00Z'), at('2026-10-23T14:00:01Z')), false);
  assert.equal(isDuplicateTap(null, at('2026-10-23T14:00:00Z')), false);
});

test('almuerzo de más de 60 minutos se marca', () => {
  assert.equal(lunchExceeded(at('2026-10-23T18:00:00Z'), at('2026-10-23T19:00:00Z')), false);
  assert.equal(lunchExceeded(at('2026-10-23T18:00:00Z'), at('2026-10-23T19:01:00Z')), true);
  assert.equal(lunchExceeded(at('2026-10-23T18:00:00Z'), at('2026-10-23T18:40:00Z'), 30), true);
});

test('desfase de reloj del equipo mayor a 2 minutos', () => {
  assert.equal(clockDrifted(at('2026-10-23T14:00:00Z'), at('2026-10-23T14:01:59Z')), false);
  assert.equal(clockDrifted(at('2026-10-23T14:00:00Z'), at('2026-10-23T14:02:01Z')), true);
  assert.equal(clockDrifted(at('2026-10-23T14:05:00Z'), at('2026-10-23T14:00:00Z')), true);
});

test('el día de trabajo usa la zona horaria del club, no UTC', () => {
  assert.equal(workDate(at('2026-10-24T05:30:00Z'), 'America/Costa_Rica'), '2026-10-23');
  assert.equal(workDate(at('2026-10-24T05:30:00Z'), 'America/Panama'), '2026-10-24');
});

test('QR del gafete: formato propio, versionado y validado', () => {
  const code = 'ABCDEFGHJKMNPQRSTVWXYZ2345';
  assert.equal(formatBadgeQr(code), 'CD1-' + code);
  assert.equal(parseBadgeQr('CD1-' + code), code);
  assert.equal(parseBadgeQr('  CD1-' + code + '\n'), code);
  assert.equal(parseBadgeQr('PA8939131'), null);
  assert.equal(parseBadgeQr('CD1-short'), null);
  assert.equal(parseBadgeQr('CD1-' + code.slice(0, 25) + 'O'), null);
});

test('hash del PIN con WebCrypto coincide con PBKDF2 de Node (servidor y kiosco calculan igual)', async () => {
  const salt = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
  const mine = await hashPin('4821', salt);
  const node = pbkdf2Sync('4821', Buffer.from(salt, 'hex'), PIN_ITERATIONS, 32, 'sha256').toString('hex');
  assert.equal(mine, node);
  assert.notEqual(await hashPin('4822', salt), mine);
});

test('hash del código del gafete es SHA-256 hex', async () => {
  const code = 'ABCDEFGHJKMNPQRSTVWXYZ2345';
  assert.equal(await hashBadgeCode(code), createHash('sha256').update(code).digest('hex'));
});
