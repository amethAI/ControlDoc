import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countryToSlug,
  recipientIdsForCountry,
  findDotacionInconsistencies,
  findCountriesWithoutRecipients,
  findEmployeeCountryMismatches,
} from './integrityChecks.ts';

test('countryToSlug normaliza acentos y espacios', () => {
  assert.equal(countryToSlug('Panama'), 'panama');
  assert.equal(countryToSlug('Costa Rica'), 'costa-rica');
  assert.equal(countryToSlug('República Dominicana'), 'republica-dominicana');
});

test('recipientIdsForCountry: Panamá incluye global y hr, el resto solo su slug', () => {
  assert.deepEqual(recipientIdsForCountry('Panama'), ['panama', 'global', 'hr']);
  assert.deepEqual(recipientIdsForCountry('Costa Rica'), ['costa-rica']);
});

const asig = (over: Partial<any> = {}) => ({
  id: 'a1', full_name: 'TEST', cuotas: 2, monto_total: '5.50', estado: 'parcial',
  pagos: [{ numero_cuota: 1, monto: '2.75' }], ...over,
});

test('dotación consistente no reporta nada', () => {
  assert.deepEqual(findDotacionInconsistencies([
    asig(),
    asig({ id: 'a2', estado: 'pendiente', pagos: [] }),
    asig({ id: 'a3', estado: 'pagado', pagos: [{ numero_cuota: 1, monto: '2.75' }, { numero_cuota: 2, monto: '2.75' }] }),
  ]), []);
});

test('detecta estado parcial sin pagos (caso Brithany)', () => {
  const r = findDotacionInconsistencies([asig({ estado: 'parcial', pagos: [] })]);
  assert.equal(r.length, 1);
  assert.match(r[0].problema, /pendiente/);
});

test('detecta pagado con saldo pendiente', () => {
  const r = findDotacionInconsistencies([asig({ estado: 'pagado' })]);
  assert.match(r[0].problema, /parcial/);
});

test('detecta cuota duplicada y más pagos que cuotas', () => {
  const dup = findDotacionInconsistencies([asig({
    estado: 'pagado', pagos: [{ numero_cuota: 1, monto: '2.75' }, { numero_cuota: 1, monto: '2.75' }],
  })]);
  assert.ok(dup.some(i => /duplicada/.test(i.problema)));

  const extra = findDotacionInconsistencies([asig({
    cuotas: 1, monto_total: '5.50', estado: 'pagado',
    pagos: [{ numero_cuota: 1, monto: '5.50' }, { numero_cuota: 2, monto: '5.50' }],
  })]);
  assert.ok(extra.some(i => /más pagos que cuotas/.test(i.problema)));
});

test('no da falso positivo por redondeo de centavos', () => {
  const r = findDotacionInconsistencies([asig({
    cuotas: 3, monto_total: '10.00', estado: 'pagado',
    pagos: [1, 2, 3].map(n => ({ numero_cuota: n, monto: '3.33' })),
  })]);
  assert.deepEqual(r, []);
});

test('país con empleados activos y sin destinatarios se reporta', () => {
  const r = findCountriesWithoutRecipients(
    { 'Panama': 70, 'Costa Rica': 46, 'República Dominicana': 0 },
    ['panama', 'global', 'hr'],
  );
  assert.deepEqual(r, ['Costa Rica']);
});

test('Panamá cubierto solo por global también cuenta como cubierto', () => {
  assert.deepEqual(findCountriesWithoutRecipients({ 'Panama': 5 }, ['global']), []);
});

test('detecta empleado con country_code distinto al de su club', () => {
  const r = findEmployeeCountryMismatches([
    { full_name: 'OK', employee_country_code: 'CR', club_country_code: 'CR' },
    { full_name: 'MAL', employee_country_code: 'PA', club_country_code: 'DO' },
  ]);
  assert.deepEqual(r.map(x => x.full_name), ['MAL']);
});
