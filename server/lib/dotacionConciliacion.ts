// Conciliación de descuentos de dotación: lo que RRHH dice que se descontó en planilla contra lo que se debe en ControlDoc.
// Regla de oro: solo se registran cuotas completas; todo lo demás queda marcado para revisión y no toca la base.

export interface Asignacion {
  asignacion_id: string;
  cedula: string;
  nombre: string;
  cuotas: number;
  monto_total: number;
  pagadas: number[]; // números de cuota con pago activo (sin anular)
}

export interface FilaArchivo {
  asignacion_id: string;
  cedula: string;
  descontado: number | null;
  observacion?: string;
}

export interface Cuota { numero: number; monto: number }

export type EstadoConciliacion =
  | 'coincide' | 'cuotas_juntas' | 'de_mas' | 'de_menos' | 'monto_distinto' | 'no_descontado'
  | 'ya_saldada' | 'falta_en_archivo' | 'desconocida' | 'datos_alterados' | 'duplicada';

export interface ResultadoConciliacion {
  asignacion_id: string;
  cedula: string;
  nombre: string;
  estado: EstadoConciliacion;
  esperado: number;
  descontado: number;
  registrar: Cuota[];
  aDevolver: number;
  observacion?: string;
}

const cents = (n: number) => Math.round(n * 100);
const money = (c: number) => c / 100;
const normCedula = (c: string | null | undefined) => (c ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase();

/** Montos de cada cuota; la última absorbe el redondeo para que la suma sea exacta. */
export function cuotaMontos(cuotas: number, montoTotal: number): number[] {
  const total = cents(montoTotal);
  const base = Math.round(total / cuotas);
  return Array.from({ length: cuotas }, (_, i) => money(i === cuotas - 1 ? total - base * (cuotas - 1) : base));
}

/** Cuotas que faltan, por número; una anulada vuelve a quedar pendiente aunque haya otras posteriores pagadas. */
export function pendingCuotas(cuotas: number, montoTotal: number, pagadas: number[]): Cuota[] {
  const activas = new Set(pagadas);
  return cuotaMontos(cuotas, montoTotal)
    .map((monto, i) => ({ numero: i + 1, monto }))
    .filter(c => !activas.has(c.numero));
}

export function estadoAsignacion(cuotas: number, pagadas: number[]): 'pendiente' | 'parcial' | 'pagado' {
  const distintas = new Set(pagadas).size;
  return distintas === 0 ? 'pendiente' : distintas >= cuotas ? 'pagado' : 'parcial';
}

function evaluar(a: Asignacion, descontado: number): Pick<ResultadoConciliacion, 'estado' | 'registrar' | 'aDevolver' | 'esperado'> {
  const pendientes = pendingCuotas(a.cuotas, a.monto_total, a.pagadas);
  const esperado = pendientes[0]?.monto ?? 0;
  const d = cents(descontado);
  if (d <= 0) return { estado: 'no_descontado', registrar: [], aDevolver: 0, esperado };
  if (pendientes.length === 0) return { estado: 'ya_saldada', registrar: [], aDevolver: money(d), esperado };

  let acumulado = 0;
  for (let k = 0; k < pendientes.length; k++) {
    acumulado += cents(pendientes[k].monto);
    if (d === acumulado) {
      return { estado: k === 0 ? 'coincide' : 'cuotas_juntas', registrar: pendientes.slice(0, k + 1), aDevolver: 0, esperado };
    }
  }
  if (d > acumulado) return { estado: 'de_mas', registrar: pendientes, aDevolver: money(d - acumulado), esperado };
  if (d < cents(esperado)) return { estado: 'de_menos', registrar: [], aDevolver: 0, esperado };
  return { estado: 'monto_distinto', registrar: [], aDevolver: 0, esperado };
}

export function conciliar(asignaciones: Asignacion[], filas: FilaArchivo[]): ResultadoConciliacion[] {
  const porId = new Map(asignaciones.map(a => [a.asignacion_id, a]));
  const vistas = new Set<string>();
  const out: ResultadoConciliacion[] = [];

  for (const f of filas) {
    const a = porId.get(f.asignacion_id);
    const descontado = Number(f.descontado) || 0;
    const base = { asignacion_id: f.asignacion_id, cedula: f.cedula, descontado, observacion: f.observacion };
    const sinAccion = { registrar: [], aDevolver: 0 };

    if (!a) { out.push({ ...base, nombre: '', estado: 'desconocida', esperado: 0, ...sinAccion }); continue; }
    if (vistas.has(a.asignacion_id)) { out.push({ ...base, nombre: a.nombre, estado: 'duplicada', esperado: 0, ...sinAccion }); continue; }
    vistas.add(a.asignacion_id);
    if (normCedula(f.cedula) !== normCedula(a.cedula)) {
      out.push({ ...base, nombre: a.nombre, estado: 'datos_alterados', esperado: 0, ...sinAccion });
      continue;
    }
    out.push({ ...base, nombre: a.nombre, ...evaluar(a, descontado) });
  }

  for (const a of asignaciones) {
    if (vistas.has(a.asignacion_id)) continue;
    const pendientes = pendingCuotas(a.cuotas, a.monto_total, a.pagadas);
    if (pendientes.length === 0) continue;
    out.push({
      asignacion_id: a.asignacion_id, cedula: a.cedula, nombre: a.nombre, estado: 'falta_en_archivo',
      esperado: pendientes[0].monto, descontado: 0, registrar: [], aDevolver: 0,
    });
  }
  return out;
}

/** Fecha calendario en Panamá (UTC-5 sin horario de verano). */
export function panamaDate(now: Date): { y: number; m: number; d: number } {
  const p = new Date(now.getTime() - 5 * 3600_000);
  return { y: p.getUTCFullYear(), m: p.getUTCMonth() + 1, d: p.getUTCDate() };
}

// La planilla corta el 15 y el 30; febrero corta el 28 (también en bisiesto)
const segundoCorte = (m: number) => (m === 2 ? 28 : 30);

/** Corte de quincena: el 15 o el 30 (28 en febrero). */
export function isQuincenaCutoff(now: Date): boolean {
  const { m, d } = panamaDate(now);
  return d === 15 || d === segundoCorte(m);
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Fecha (YYYY-MM-DD) del corte de quincena más reciente, hoy incluido. */
export function ultimoCorte(now: Date): string {
  const { y, m, d } = panamaDate(now);
  if (d >= segundoCorte(m)) return iso(y, m, segundoCorte(m));
  if (d >= 15) return iso(y, m, 15);
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  return iso(py, pm, segundoCorte(pm));
}
