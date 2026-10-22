import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCarneAlertDue, countryRecipientId, carneStatus } from './expiryRules.ts';

test('carneStatus separa vencido, por vencer y lejano para el dashboard', () => {
  const today = '2026-10-22', in30 = '2026-11-21';
  assert.equal(carneStatus('2026-10-01', today, in30), 'expired');
  assert.equal(carneStatus('2026-10-21', today, in30), 'expired');
  assert.equal(carneStatus('2026-10-22', today, in30), 'expiring');
  assert.equal(carneStatus('2026-11-15', today, in30), 'expiring');
  assert.equal(carneStatus('2026-11-21', today, in30), 'expiring');
  assert.equal(carneStatus('2026-11-22', today, in30), null);
  assert.equal(carneStatus(null, today, in30), null);
});

const threshold = '2026-11-21';

test('carné vencido sigue alertando hasta que se renueve', () => {
  assert.equal(isCarneAlertDue('2026-08-20', threshold), true);
});

test('carné que vence dentro del umbral alerta, incluido el último día', () => {
  assert.equal(isCarneAlertDue('2026-11-15', threshold), true);
  assert.equal(isCarneAlertDue('2026-11-21', threshold), true);
});

test('carné lejano o sin fecha no alerta', () => {
  assert.equal(isCarneAlertDue('2029-05-31', threshold), false);
  assert.equal(isCarneAlertDue(null, threshold), false);
  assert.equal(isCarneAlertDue(undefined, threshold), false);
});

test('acepta timestamps además de fechas', () => {
  assert.equal(isCarneAlertDue('2026-10-01T00:00:00+00:00', threshold), true);
});

test('cada país rutea a su propio destinatario virtual, nunca a Panamá por defecto', () => {
  assert.equal(countryRecipientId('Costa Rica'), 'costa-rica');
  assert.equal(countryRecipientId('República Dominicana'), 'republica-dominicana');
  assert.equal(countryRecipientId('Guatemala'), 'guatemala');
  assert.equal(countryRecipientId('Panama'), 'panama');
  assert.equal(countryRecipientId(null), null);
});
