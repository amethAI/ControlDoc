import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCedula } from './cedula.ts';

test('espacios se convierten en guiones (cédulas corrompidas por la vista)', () => {
  assert.equal(normalizeCedula('8 939 131'), '8-939-131');
  assert.equal(normalizeCedula('  10  710 972 '), '10-710-972');
});

test('cédulas ya correctas no cambian', () => {
  assert.equal(normalizeCedula('8-0168-0843'), '8-0168-0843');
  assert.equal(normalizeCedula('155817554320'), '155817554320');
  assert.equal(normalizeCedula('E-8-156017'), 'E-8-156017');
});
