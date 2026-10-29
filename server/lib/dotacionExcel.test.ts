import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildConciliacionExcel, parseConciliacionExcel, loadWorkbook, type FilaExcel } from './dotacionExcel.ts';

const lote = { id: '11111111-1111-1111-1111-111111111111', fecha_quincena: '2026-11-15' };
const filas: FilaExcel[] = [
  { asignacion_id: 'a-1', nombre: 'Demo Uno', cedula: '8-000-1', club: 'Club Demo', tanda: 'Tanda Demo', cuota: '2 de 2', esperado: 2.75 },
  { asignacion_id: 'a-2', nombre: 'Demo Dos', cedula: '8-000-2', club: 'Club Demo', tanda: 'Tanda Demo', cuota: '1 de 2', esperado: 5 },
];

test('el Excel generado se lee de vuelta con el lote y lo esperado prellenado', async () => {
  const buf = await buildConciliacionExcel(lote, filas);
  const out = await parseConciliacionExcel(buf);
  assert.equal(out.loteId, lote.id);
  assert.equal(out.fechaQuincena, lote.fecha_quincena);
  assert.deepEqual(out.filas.map(f => [f.asignacion_id, f.cedula, f.descontado]), [['a-1', '8-000-1', 2.75], ['a-2', '8-000-2', 5]]);
});

test('lo que RRHH cambia en planilla y observación es lo que se lee', async () => {
  const wb = await loadWorkbook(await buildConciliacionExcel(lote, filas));
  const ws = wb.getWorksheet('Conciliación')!;
  const header = ws.getRow(4).values as unknown[];
  const col = (name: string) => header.findIndex(v => v === name);
  ws.getRow(6).getCell(col('Monto descontado en planilla')).value = 0;
  ws.getRow(6).getCell(col('Observación')).value = 'Incapacidad';
  const out = await parseConciliacionExcel(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(out.filas[1].descontado, 0);
  assert.equal(out.filas[1].observacion, 'Incapacidad');
});

test('solo planilla y observación quedan editables; la hoja está protegida', async () => {
  const wb = await loadWorkbook(await buildConciliacionExcel(lote, filas));
  const ws = wb.getWorksheet('Conciliación')!;
  assert.ok((ws as any).sheetProtection?.sheet);
  const header = ws.getRow(4).values as unknown[];
  const col = (name: string) => header.findIndex(v => v === name);
  assert.equal(ws.getRow(5).getCell(col('Monto descontado en planilla')).protection?.locked, false);
  assert.equal(ws.getRow(5).getCell(col('Observación')).protection?.locked, false);
  assert.notEqual(ws.getRow(5).getCell(col('Cédula')).protection?.locked, false);
});

test('un archivo que no es el formato de conciliación se rechaza', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Hoja1').addRow(['Nombre', 'Monto']);
  await assert.rejects(parseConciliacionExcel(Buffer.from(await wb.xlsx.writeBuffer())), /formato de conciliación/);
});
