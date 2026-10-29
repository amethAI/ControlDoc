// Formato de conciliación quincenal que RRHH recibe por correo y devuelve en ControlDoc.
// La protección de la hoja evita ediciones accidentales; la seguridad real es que el servidor recalcula todo al subirlo.
import ExcelJS from 'exceljs';
import { randomBytes } from 'crypto';
import type { FilaArchivo } from './dotacionConciliacion.ts';

export interface FilaExcel {
  asignacion_id: string;
  nombre: string;
  cedula: string;
  club: string;
  tanda: string;
  cuota: string;
  esperado: number;
}

const SHEET = 'Conciliación';
const META = '_lote';
const HEADER_ROW = 4;
const COLS = ['ID', 'Colaborador', 'Cédula', 'Club', 'Tanda', 'Cuota', 'Monto a descontar', 'Monto descontado en planilla', 'Observación'];
const EDITABLE = new Set(['Monto descontado en planilla', 'Observación']);
const FONT = { name: 'Arial', size: 10 };

const fechaCorta = (iso: string) => iso.split('-').reverse().join('/');

export async function buildConciliacionExcel(lote: { id: string; fecha_quincena: string }, filas: FilaExcel[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ControlDoc';
  const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: HEADER_ROW }] });

  ws.getCell('B1').value = `Descuentos de dotación — quincena del ${fechaCorta(lote.fecha_quincena)}`;
  ws.getCell('B1').font = { ...FONT, size: 13, bold: true };
  ws.getCell('B2').value = 'La columna "Monto descontado en planilla" viene con lo esperado. Si en planilla se descontó otro monto o nada, cambialo y explicá en Observación. Solo esas dos columnas se pueden editar.';
  ws.getCell('B2').font = { ...FONT, italic: true, color: { argb: 'FF555555' } };

  const header = ws.getRow(HEADER_ROW);
  COLS.forEach((name, i) => {
    const c = header.getCell(i + 1);
    c.value = name;
    c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EDITABLE.has(name) ? 'FF1F6F43' : 'FF2F3B52' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  header.height = 30;

  filas.forEach((f, i) => {
    const row = ws.getRow(HEADER_ROW + 1 + i);
    row.values = [f.asignacion_id, f.nombre, f.cedula, f.club, f.tanda, f.cuota, f.esperado, f.esperado, ''];
    row.eachCell({ includeEmpty: true }, (c, n) => {
      c.font = FONT;
      if (n === 7 || n === 8) c.numFmt = '"$"#,##0.00';
      if (EDITABLE.has(COLS[n - 1])) {
        c.protection = { locked: false };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8D6' } };
      }
    });
  });

  [38, 32, 14, 20, 24, 9, 14, 18, 30].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(1).hidden = true;
  await ws.protect(randomBytes(12).toString('hex'), { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true });

  const meta = wb.addWorksheet(META);
  meta.getCell('A1').value = lote.id;
  meta.getCell('A2').value = lote.fecha_quincena;
  meta.state = 'veryHidden';

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
  if (typeof v === 'object' && 'richText' in v) return v.richText.map(t => t.text).join('');
  return String(v).trim();
}

function cellMoney(v: ExcelJS.CellValue): number | null {
  const raw = typeof v === 'object' && v && 'result' in v ? v.result : v;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const n = parseFloat(String(raw).replace(/[$\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// exceljs tipa su Buffer como ArrayBuffer; le pasamos exactamente los bytes del archivo
export async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  return wb;
}

export async function parseConciliacionExcel(buf: Buffer): Promise<{ loteId: string; fechaQuincena: string; filas: FilaArchivo[] }> {
  const wb = await loadWorkbook(buf);
  const ws = wb.getWorksheet(SHEET);
  const meta = wb.getWorksheet(META);
  if (!ws || !meta) throw new Error('El archivo no es el formato de conciliación que envía ControlDoc');

  const header = (ws.getRow(HEADER_ROW).values as ExcelJS.CellValue[]).map(cellText);
  const col = (name: string) => header.indexOf(name);
  if (COLS.some(name => col(name) < 0)) throw new Error('El archivo no es el formato de conciliación que envía ControlDoc (faltan columnas)');

  const filas: FilaArchivo[] = [];
  for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const id = cellText(row.getCell(col('ID')).value);
    if (!id) continue;
    filas.push({
      asignacion_id: id,
      cedula: cellText(row.getCell(col('Cédula')).value),
      descontado: cellMoney(row.getCell(col('Monto descontado en planilla')).value),
      observacion: cellText(row.getCell(col('Observación')).value) || undefined,
    });
  }
  return { loteId: cellText(meta.getCell('A1').value), fechaQuincena: cellText(meta.getCell('A2').value), filas };
}
