import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { dateOrEmpty } from './validation.ts';

const schema = z.object({ contract_end: dateOrEmpty });

test('fecha válida pasa tal cual', () => {
  assert.deepEqual(schema.parse({ contract_end: '2027-04-15' }), { contract_end: '2027-04-15' });
});

test('fecha vacía, null o ausente queda sin fecha (contrato indefinido)', () => {
  assert.equal(schema.parse({ contract_end: '' }).contract_end, undefined);
  assert.equal(schema.parse({ contract_end: null }).contract_end, undefined);
  assert.equal(schema.parse({}).contract_end, undefined);
});

test('una fecha con otro formato se rechaza con un mensaje claro', () => {
  const r = schema.safeParse({ contract_end: '15/04/2027' });
  assert.equal(r.success, false);
  assert.match(JSON.stringify(r.error!.flatten().fieldErrors), /Formato de fecha inválido/);
});
