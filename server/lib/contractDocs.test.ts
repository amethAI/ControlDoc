import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isContractTiedDoc, resolveDocExpiry } from './contractDocs.ts';

test('el contrato firmado y la solicitud de entrada están atados al contrato', () => {
  assert.equal(isContractTiedDoc('Contrato firmado'), true);
  assert.equal(isContractTiedDoc('Solicitud de entrada al club'), true);
  assert.equal(isContractTiedDoc('Carnet verde'), false);
  assert.equal(isContractTiedDoc(null), false);
});

test('documento atado al contrato: manda la fecha del contrato, no la del formulario', () => {
  assert.equal(
    resolveDocExpiry({ docTypeName: 'Contrato firmado', formExpiry: '2026-11-02', contractType: 'Definido 1 año', contractEnd: '2027-05-02' }),
    '2027-05-02',
  );
});

test('documento atado al contrato sin fecha en el formulario toma la del contrato', () => {
  assert.equal(
    resolveDocExpiry({ docTypeName: 'Solicitud de entrada al club', formExpiry: '', contractType: 'Definido', contractEnd: '2026-12-31' }),
    '2026-12-31',
  );
});

test('contrato indefinido o sin fecha de fin: se respeta lo del formulario', () => {
  assert.equal(
    resolveDocExpiry({ docTypeName: 'Contrato firmado', formExpiry: '2027-01-15', contractType: 'Indefinido', contractEnd: '2026-05-01' }),
    '2027-01-15',
  );
  assert.equal(
    resolveDocExpiry({ docTypeName: 'Contrato firmado', formExpiry: '', contractType: 'Definido', contractEnd: null }),
    null,
  );
});

test('otros documentos usan siempre la fecha del formulario', () => {
  assert.equal(
    resolveDocExpiry({ docTypeName: 'Carnet verde', formExpiry: '2027-03-01', contractType: 'Definido 1 año', contractEnd: '2027-05-02' }),
    '2027-03-01',
  );
});
