import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probationEnd, probationStatus, contractTerm, probationMonths } from './checklistRules.ts';

test('período de prueba: 2 meses en Costa Rica, 3 en el resto', () => {
  assert.equal(probationMonths('CR'), 2);
  assert.equal(probationMonths('Costa Rica'), 2);
  assert.equal(probationMonths('PA'), 3);
  assert.equal(probationMonths('Panama'), 3);
  assert.equal(probationMonths(null), 3);
});

test('probationEnd con 2 meses para CR', () => {
  assert.equal(probationEnd('2026-08-07', 2), '2026-10-07');
  assert.equal(probationEnd('2026-06-19', probationMonths('CR')), '2026-08-19');
});

test('probationEnd suma 3 meses sin correrse por zona horaria', () => {
  assert.equal(probationEnd('2026-08-07'), '2026-11-07');
  assert.equal(probationEnd('2025-11-28'), '2026-02-28');
  assert.equal(probationEnd('2026-06-19T00:00:00+00:00'), '2026-09-19');
});

test('probationEnd vacío o inválido devuelve vacío', () => {
  assert.equal(probationEnd(''), '');
  assert.equal(probationEnd(null), '');
  assert.equal(probationEnd('no-fecha'), '');
});

const today = new Date('2026-10-22T12:00:00');

test('probationStatus: terminado, por terminar y en curso', () => {
  assert.equal(probationStatus('2024-09-14', today), 'cumplido');
  assert.equal(probationStatus('2026-11-07', today), 'por-terminar');
  assert.equal(probationStatus('2026-10-22', today), 'por-terminar');
  assert.equal(probationStatus('2027-01-15', today), 'en-curso');
  assert.equal(probationStatus('', today), null);
});

test('contractTerm muestra la fecha o Indefinido', () => {
  assert.equal(contractTerm('2027-03-01', 'Definido'), '2027-03-01');
  assert.equal(contractTerm(null, 'Indefinido'), 'Indefinido');
  assert.equal(contractTerm('', 'indefinido'), 'Indefinido');
  assert.equal(contractTerm(null, 'Definido'), '');
});
