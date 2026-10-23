// Reglas de marcación compartidas por el kiosco (navegador) y el servidor (Node).
// Solo usa WebCrypto e Intl, disponibles en ambos entornos.

export const MARK_SEQUENCE = ['entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida'] as const;
export type MarkType = (typeof MARK_SEQUENCE)[number];

export const MARK_LABEL: Record<MarkType, string> = {
  entrada: 'Entrada',
  salida_almuerzo: 'Salida almuerzo',
  regreso_almuerzo: 'Regreso almuerzo',
  salida: 'Salida',
};

export const DUPLICATE_TAP_MS = 2 * 60 * 1000;
export const CLOCK_DRIFT_MS = 2 * 60 * 1000;
export const LUNCH_LIMIT_MIN = 60;
export const PIN_ITERATIONS = 60_000;
export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 10 * 60 * 1000;

export function nextMarkType(todayMarks: { type: string }[]): MarkType | null {
  const done = new Set(todayMarks.map(m => m.type));
  return MARK_SEQUENCE.find(t => !done.has(t)) ?? null;
}

export function isDuplicateTap(lastMarkMs: number | null, nowMs: number, windowMs = DUPLICATE_TAP_MS): boolean {
  return lastMarkMs !== null && nowMs - lastMarkMs < windowMs;
}

export function lunchExceeded(salidaMs: number, regresoMs: number, limitMin = LUNCH_LIMIT_MIN): boolean {
  return regresoMs - salidaMs > limitMin * 60 * 1000;
}

export function clockDrifted(deviceNowMs: number, serverNowMs: number, toleranceMs = CLOCK_DRIFT_MS): boolean {
  return Math.abs(serverNowMs - deviceNowMs) > toleranceMs;
}

export function workDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// Base32 de Crockford (sin I, L, O, U): 26 caracteres = 130 bits
export const BADGE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const BADGE_CODE_LENGTH = 26;
const BADGE_PREFIX = 'CD1-';
const BADGE_RE = new RegExp(`^${BADGE_PREFIX}([${BADGE_ALPHABET}]{${BADGE_CODE_LENGTH}})$`);

export function formatBadgeQr(code: string): string {
  return BADGE_PREFIX + code;
}

export function parseBadgeQr(text: string): string | null {
  const m = text.trim().toUpperCase().match(BADGE_RE);
  return m ? m[1] : null;
}

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map(h => parseInt(h, 16)));

export async function hashBadgeCode(code: string): Promise<string> {
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
}

export async function hashPin(pin: string, saltHex: string, iterations = PIN_ITERATIONS): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(bits);
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}
