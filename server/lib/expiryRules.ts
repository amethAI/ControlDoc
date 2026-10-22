import { countryToSlug } from './integrityChecks.ts';

// Misma regla que los documentos: alerta si vence dentro del umbral o ya venció (hasta que se renueve)
export function isCarneAlertDue(vencimiento: string | null | undefined, thresholdStr: string): boolean {
  if (!vencimiento) return false;
  return vencimiento.slice(0, 10) <= thresholdStr;
}

export function carneStatus(
  vencimiento: string | null | undefined,
  todayStr: string,
  thresholdStr: string,
): 'expired' | 'expiring' | null {
  if (!vencimiento) return null;
  const d = vencimiento.slice(0, 10);
  if (d < todayStr) return 'expired';
  return d <= thresholdStr ? 'expiring' : null;
}

export function countryRecipientId(country: string | null | undefined): string | null {
  return country ? countryToSlug(country) : null;
}
