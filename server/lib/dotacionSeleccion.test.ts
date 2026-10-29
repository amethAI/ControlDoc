import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modoSeleccion, camisasDisponibles, pdfPathFor, type AsigResumen } from './dotacionSeleccion.ts';

const asig = (o: Partial<AsigResumen>): AsigResumen =>
  ({ id: 'a', cantidad: 1, cuotas: 2, monto_total: 5, estado: 'pendiente', secuencia: 1, pagosActivos: 0, ...o });

test('sin selección previa: es un pedido nuevo', () => {
  assert.deepEqual(modoSeleccion([]), { modo: 'nueva', secuencia: 1 });
});

test('selección sin descuentos: la puede modificar', () => {
  const a = asig({ id: 'x' });
  assert.deepEqual(modoSeleccion([a]), { modo: 'modificar', asignacion: a });
});

test('con descuentos y sin terminar de pagar: queda bloqueada', () => {
  const a = asig({ estado: 'parcial', pagosActivos: 1 });
  assert.deepEqual(modoSeleccion([a]), { modo: 'en_curso', asignacion: a });
});

test('todo pagado: puede pedir más con el siguiente número de pedido', () => {
  const pagada = asig({ estado: 'pagado', pagosActivos: 2 });
  assert.deepEqual(modoSeleccion([pagada]), { modo: 'adicional', secuencia: 2, pagadas: [pagada] });
});

test('un pedido adicional abierto manda sobre los pagados', () => {
  const vieja = asig({ id: 'v', estado: 'pagado', pagosActivos: 2, secuencia: 1 });
  const nueva = asig({ id: 'n', secuencia: 2 });
  assert.deepEqual(modoSeleccion([vieja, nueva]), { modo: 'modificar', asignacion: nueva });
  const enCurso = asig({ id: 'n', secuencia: 2, estado: 'parcial', pagosActivos: 1 });
  assert.deepEqual(modoSeleccion([vieja, enCurso]), { modo: 'en_curso', asignacion: enCurso });
});

test('si una cuota anulada reabre un pedido viejo, se paga eso antes de pedir más', () => {
  const reabierta = asig({ id: 'v', estado: 'parcial', pagosActivos: 1, secuencia: 1 });
  const pagada = asig({ id: 'p', estado: 'pagado', pagosActivos: 2, secuencia: 2 });
  assert.equal(modoSeleccion([reabierta, pagada]).modo, 'en_curso');
});

test('camisas disponibles en la tanda', () => {
  assert.equal(camisasDisponibles(20, 7), 13);
  assert.equal(camisasDisponibles(20, 25), 0);
  assert.equal(camisasDisponibles(null, 7), null);
});

test('el primer pedido conserva su PDF; los adicionales no lo pisan', () => {
  assert.equal(pdfPathFor('t', 'e', 1), 't/e.pdf');
  assert.equal(pdfPathFor('t', 'e', 2), 't/e-2.pdf');
});
