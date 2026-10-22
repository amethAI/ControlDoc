import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIncompleteEmployees } from './compliance.ts';

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
