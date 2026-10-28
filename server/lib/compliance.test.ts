import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIncompleteEmployees, findMissingDocuments } from './compliance.ts';

const types = [
  { id: 'pa-contrato', country_code: 'PA' },
  { id: 'pa-css', country_code: 'PA' },
  { id: 'cr-personal', country_code: 'CR' },
  { id: 'universal', country_code: null },
];

test('empleado con todos los obligatorios de su país está completo', () => {
  const r = findIncompleteEmployees(
    [{ id: 'e1', country_code: 'PA' }],
    types,
    [{ employee_id: 'e1', document_type_id: 'pa-contrato' }, { employee_id: 'e1', document_type_id: 'pa-css' }, { employee_id: 'e1', document_type_id: 'universal' }],
  );
  assert.deepEqual(r, []);
});

test('falta un obligatorio de su país → incompleto', () => {
  const r = findIncompleteEmployees(
    [{ id: 'e1', country_code: 'PA' }],
    types,
    [{ employee_id: 'e1', document_type_id: 'pa-contrato' }, { employee_id: 'e1', document_type_id: 'universal' }],
  );
  assert.deepEqual(r, ['e1']);
});

test('los obligatorios de otro país no cuentan', () => {
  const r = findIncompleteEmployees(
    [{ id: 'e2', country_code: 'CR' }],
    types,
    [{ employee_id: 'e2', document_type_id: 'cr-personal' }, { employee_id: 'e2', document_type_id: 'universal' }],
  );
  assert.deepEqual(r, []);
});

test('país sin tipos obligatorios propios solo exige los universales', () => {
  assert.deepEqual(findIncompleteEmployees([{ id: 'e3', country_code: 'DO' }], types, []), ['e3']);
  assert.deepEqual(findIncompleteEmployees([{ id: 'e3', country_code: 'DO' }], types.filter(t => t.country_code), []), []);
});

test('un registro manual sin archivo no cuenta como documento subido', () => {
  const r = findIncompleteEmployees(
    [{ id: 'e1', country_code: 'PA' }],
    types,
    [
      { employee_id: 'e1', document_type_id: 'pa-contrato', file_url: 'https://x/contrato.pdf' },
      { employee_id: 'e1', document_type_id: 'pa-css', file_url: 'manual_entry' },
      { employee_id: 'e1', document_type_id: 'universal', file_url: 'https://x/u.pdf' },
    ],
  );
  assert.deepEqual(r, ['e1']);
});

test('detalle: dice qué falta y cuáles son solo un registro manual', () => {
  const r = findMissingDocuments(
    [{ id: 'e1', country_code: 'PA' }, { id: 'e2', country_code: 'PA' }],
    types,
    [
      { employee_id: 'e1', document_type_id: 'pa-contrato', file_url: 'https://x/c.pdf' },
      { employee_id: 'e1', document_type_id: 'pa-css', file_url: 'manual_entry' },
      { employee_id: 'e2', document_type_id: 'pa-contrato', file_url: 'https://x/c2.pdf' },
      { employee_id: 'e2', document_type_id: 'pa-css', file_url: 'https://x/css.pdf' },
      { employee_id: 'e2', document_type_id: 'universal', file_url: 'https://x/u2.pdf' },
    ],
  );
  assert.deepEqual(r, [{ employee_id: 'e1', missing: ['pa-css', 'universal'], manualOnly: ['pa-css'] }]);
});

test('detalle: si hay archivo y además un registro manual, cuenta el archivo', () => {
  const r = findMissingDocuments(
    [{ id: 'e1', country_code: 'CR' }],
    types,
    [
      { employee_id: 'e1', document_type_id: 'cr-personal', file_url: 'manual_entry' },
      { employee_id: 'e1', document_type_id: 'cr-personal', file_url: 'https://x/p.pdf' },
      { employee_id: 'e1', document_type_id: 'universal', file_url: 'https://x/u.pdf' },
    ],
  );
  assert.deepEqual(r, []);
});
