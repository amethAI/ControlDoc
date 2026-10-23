import { randomInt, randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import {
  BADGE_ALPHABET,
  BADGE_CODE_LENGTH,
  MARK_SEQUENCE,
  nextMarkType,
  lunchExceeded,
} from '../../src/lib/attendanceRules.ts';

export function generateBadgeCode(): string {
  let code = '';
  for (let i = 0; i < BADGE_CODE_LENGTH; i++) code += BADGE_ALPHABET[randomInt(BADGE_ALPHABET.length)];
  return code;
}

const PIN_BLACKLIST = new Set(['2580', '0852', '1004', '2000', '2001', '6969', '1010', '1122', '1984']);

export function isWeakPin(pin: string): boolean {
  const d = pin.split('').map(Number);
  if (PIN_BLACKLIST.has(pin)) return true;
  if (d.every(x => x === d[0])) return true;
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every(s => s === 1) || steps.every(s => s === -1)) return true;
  if (d[0] === d[2] && d[1] === d[3]) return true;
  if (d[0] === d[1] && d[2] === d[3]) return true;
  return false;
}

export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(10_000)).padStart(4, '0');
    if (!isWeakPin(pin)) return pin;
  }
}

export function generateDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generatePairingCode(): string {
  return String(randomInt(1_000_000)).padStart(6, '0');
}

export function generatePinSalt(): string {
  return randomBytes(16).toString('hex');
}

export function readDeviceToken(authorization: string | undefined): string | null {
  const m = authorization?.match(/^Device\s+(\S+)$/);
  return m ? m[1] : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDateTime = z.string().max(40).refine(v => /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)), 'fecha inválida');

export const markBatchSchema = z.object({
  device_now: isoDateTime,
  pending: z.number().int().min(0).max(100_000).optional(),
  app_version: z.string().max(40).optional(),
  marks: z.array(z.object({
    id: z.string().regex(UUID_RE),
    employee_id: z.string().min(1).max(64),
    badge_id: z.string().regex(UUID_RE),
    type: z.enum(MARK_SEQUENCE),
    device_time: isoDateTime,
  })).min(1).max(100),
});
export type MarkBatch = z.infer<typeof markBatchSchema>;

export interface EnablementInput {
  contract_type: string | null;
  contract_end: string | null;
  cr_carne_vencimiento: string | null;
  expiredDocNames: string[];
}

// Mismo criterio que el dashboard: se marca igual, pero el kiosco muestra el motivo y la marca queda señalada
export function employeeEnablement(e: EnablementInput, todayStr: string): { enabled: boolean; reason: string | null } {
  if (e.cr_carne_vencimiento && e.cr_carne_vencimiento.slice(0, 10) < todayStr) return { enabled: false, reason: 'Carné vencido' };
  if (e.expiredDocNames.length > 0) return { enabled: false, reason: `${e.expiredDocNames[0]} vencido` };
  if (e.contract_end && e.contract_type?.toLowerCase() !== 'indefinido' && e.contract_end.slice(0, 10) < todayStr) {
    return { enabled: false, reason: 'Contrato vencido' };
  }
  return { enabled: true, reason: null };
}

export interface MarkFlagInput {
  type: string;
  markedMs: number;
  dayMarks: { type: string; markedMs: number }[];
  employeeEnabled: boolean;
  badgeRevoked: boolean;
  drifted: boolean;
}

export function computeMarkFlags(i: MarkFlagInput): string[] {
  const flags: string[] = [];
  if (i.drifted) flags.push('reloj_desfasado');
  if (i.badgeRevoked) flags.push('gafete_anulado');
  if (!i.employeeEnabled) flags.push('docs_vencidos');
  if (i.dayMarks.some(m => m.type === i.type)) flags.push('duplicada');
  else if (nextMarkType(i.dayMarks) !== i.type) flags.push('fuera_de_orden');
  if (i.type === 'regreso_almuerzo') {
    const salida = i.dayMarks.find(m => m.type === 'salida_almuerzo');
    if (salida && lunchExceeded(salida.markedMs, i.markedMs)) flags.push('almuerzo_largo');
  }
  return flags;
}
