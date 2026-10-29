import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingCuotas, conciliar, isQuincenaCutoff, estadoAsignacion, ultimoCorte, type Asignacion } from './dotacionConciliacion.ts';

const asig = (id: string, cuotas: number, total: number, pagadas: number[] = [], cedula = `8-000-${id}`): Asignacion =>
  ({ asignacion_id: id, cedula, nombre: `Demo ${id}`, cuotas, monto_total: total, pagadas });

test('cuotas pendientes: faltan las que no están pagadas, la última absorbe el redondeo', () => {
  assert.deepEqual(pendingCuotas(2, 5.5, []), [{ numero: 1, monto: 2.75 }, { numero: 2, monto: 2.75 }]);
  assert.deepEqual(pendingCuotas(2, 5.55, []), [{ numero: 1, monto: 2.78 }, { numero: 2, monto: 2.77 }]);
  assert.deepEqual(pendingCuotas(2, 5.5, [1]), [{ numero: 2, monto: 2.75 }]);
  // Si se anuló la 1 y quedó la 2, la que falta es la 1, no "la siguiente"
  assert.deepEqual(pendingCuotas(2, 5.5, [2]), [{ numero: 1, monto: 2.75 }]);
  assert.deepEqual(pendingCuotas(1, 5.5, [1]), []);
});

test('descontado igual a la cuota: coincide y registra esa cuota', () => {
  const [r] = conciliar([asig('a', 2, 5.5, [1])], [{ asignacion_id: 'a', cedula: '8-000-a', descontado: 2.75 }]);
  assert.equal(r.estado, 'coincide');
  assert.deepEqual(r.registrar, [{ numero: 2, monto: 2.75 }]);
  assert.equal(r.aDevolver, 0);
});

test('descontó varias cuotas juntas para ponerse al día', () => {
  const [r] = conciliar([asig('b', 2, 5.5)], [{ asignacion_id: 'b', cedula: '8-000-b', descontado: 5.5 }]);
  assert.equal(r.estado, 'cuotas_juntas');
  assert.deepEqual(r.registrar.map(c => c.numero), [1, 2]);
});

test('descontó más que todo el saldo: registra lo debido y marca lo que hay que devolver', () => {
  const [r] = conciliar([asig('c', 2, 5.5, [1])], [{ asignacion_id: 'c', cedula: '8-000-c', descontado: 5.5 }]);
  assert.equal(r.estado, 'de_mas');
  assert.deepEqual(r.registrar, [{ numero: 2, monto: 2.75 }]);
  assert.equal(r.aDevolver, 2.75);
});

test('descontó menos que una cuota: no registra nada', () => {
  const [r] = conciliar([asig('d', 2, 5.5)], [{ asignacion_id: 'd', cedula: '8-000-d', descontado: 1 }]);
  assert.equal(r.estado, 'de_menos');
  assert.deepEqual(r.registrar, []);
});

test('un monto que no cierra cuotas completas no se registra', () => {
  const [r] = conciliar([asig('e', 2, 5.5)], [{ asignacion_id: 'e', cedula: '8-000-e', descontado: 4 }]);
  assert.equal(r.estado, 'monto_distinto');
  assert.deepEqual(r.registrar, []);
});

test('cero o vacío: no descontado, sigue pendiente', () => {
  const out = conciliar([asig('f', 2, 10), asig('g', 2, 10)], [
    { asignacion_id: 'f', cedula: '8-000-f', descontado: 0 },
    { asignacion_id: 'g', cedula: '8-000-g', descontado: null },
  ]);
  assert.deepEqual(out.map(r => r.estado), ['no_descontado', 'no_descontado']);
  assert.ok(out.every(r => r.registrar.length === 0));
});

test('quien debía y no viene en el archivo queda marcado', () => {
  const out = conciliar([asig('h', 2, 10), asig('i', 2, 10)], [{ asignacion_id: 'h', cedula: '8-000-h', descontado: 5 }]);
  const falta = out.find(r => r.asignacion_id === 'i')!;
  assert.equal(falta.estado, 'falta_en_archivo');
  assert.deepEqual(falta.registrar, []);
});

test('ya estaba saldada: no registra y lo descontado es a devolver', () => {
  const [r] = conciliar([asig('j', 1, 5.5, [1])], [{ asignacion_id: 'j', cedula: '8-000-j', descontado: 5.5 }]);
  assert.equal(r.estado, 'ya_saldada');
  assert.equal(r.aDevolver, 5.5);
  assert.deepEqual(r.registrar, []);
});

test('una fila que no existe en ControlDoc o con la cédula cambiada no se registra', () => {
  const out = conciliar([asig('k', 2, 5.5)], [
    { asignacion_id: 'zzz', cedula: '8-000-z', descontado: 2.75 },
    { asignacion_id: 'k', cedula: '9-999-999', descontado: 2.75 },
  ]);
  assert.equal(out.find(r => r.asignacion_id === 'zzz')!.estado, 'desconocida');
  assert.equal(out.find(r => r.asignacion_id === 'k')!.estado, 'datos_alterados');
  assert.ok(out.every(r => r.registrar.length === 0));
});

test('la misma fila repetida solo cuenta una vez', () => {
  const out = conciliar([asig('l', 2, 5.5)], [
    { asignacion_id: 'l', cedula: '8-000-l', descontado: 2.75 },
    { asignacion_id: 'l', cedula: '8-000-l', descontado: 2.75 },
  ]);
  assert.deepEqual(out.map(r => r.estado), ['coincide', 'duplicada']);
  assert.equal(out[1].registrar.length, 0);
});

test('la cédula se compara sin importar espacios o guiones', () => {
  const [r] = conciliar([asig('m', 2, 5.5, [], '4-804-65')], [{ asignacion_id: 'm', cedula: '4 804 65', descontado: 2.75 }]);
  assert.equal(r.estado, 'coincide');
});

test('corte de quincena: el 15 y el 30; en febrero el 28', () => {
  const d = (s: string) => new Date(`${s}T13:00:00Z`);
  assert.equal(isQuincenaCutoff(d('2026-10-15')), true);
  assert.equal(isQuincenaCutoff(d('2026-10-30')), true);
  assert.equal(isQuincenaCutoff(d('2026-10-31')), false);
  assert.equal(isQuincenaCutoff(d('2026-11-30')), true);
  assert.equal(isQuincenaCutoff(d('2027-01-28')), false);
  assert.equal(isQuincenaCutoff(d('2027-02-28')), true);
  assert.equal(isQuincenaCutoff(d('2028-02-28')), true);
  assert.equal(isQuincenaCutoff(d('2028-02-29')), false);
});

test('último corte de quincena a la fecha', () => {
  const d = (s: string) => new Date(`${s}T13:00:00Z`);
  assert.equal(ultimoCorte(d('2026-11-15')), '2026-11-15');
  assert.equal(ultimoCorte(d('2026-11-20')), '2026-11-15');
  assert.equal(ultimoCorte(d('2026-11-30')), '2026-11-30');
  assert.equal(ultimoCorte(d('2026-12-03')), '2026-11-30');
  assert.equal(ultimoCorte(d('2026-10-31')), '2026-10-30');
  assert.equal(ultimoCorte(d('2027-01-10')), '2026-12-30');
  assert.equal(ultimoCorte(d('2027-03-01')), '2027-02-28');
  assert.equal(ultimoCorte(d('2028-02-29')), '2028-02-28');
});

test('estado de la asignación según cuotas activas', () => {
  assert.equal(estadoAsignacion(2, []), 'pendiente');
  assert.equal(estadoAsignacion(2, [2]), 'parcial');
  assert.equal(estadoAsignacion(2, [1, 2]), 'pagado');
  assert.equal(estadoAsignacion(1, [1, 1]), 'pagado');
});
