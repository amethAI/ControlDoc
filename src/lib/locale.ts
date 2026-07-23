/**
 * Centraliza locale/timezone del club activo.
 * El frontend recibe `club_locale` y `club_timezone` en el payload de /auth/me.
 * Todo componente que necesite formatear fechas debe leer desde acá, NO hardcodear 'es-PA'.
 */

export const SYSTEM_LOCALE   = import.meta.env.VITE_APP_LOCALE   ?? 'es-PA';
export const SYSTEM_TIMEZONE = import.meta.env.VITE_APP_TIMEZONE  ?? 'America/Panama';

export interface LocaleConfig {
  locale:   string;
  timezone: string;
}

/** Fallback seguro cuando no hay usuario autenticado todavía. */
export const DEFAULTS: LocaleConfig = {
  locale:   SYSTEM_LOCALE,
  timezone: SYSTEM_TIMEZONE,
};

export function formatDateTime(
  dateStr: string,
  opts: Intl.DateTimeFormatOptions,
  cfg: LocaleConfig = DEFAULTS
): string {
  return new Date(dateStr).toLocaleString(cfg.locale, { ...opts, timeZone: cfg.timezone });
}

export function formatDate(
  dateStr: string,
  opts: Intl.DateTimeFormatOptions,
  cfg: LocaleConfig = DEFAULTS
): string {
  return new Date(dateStr).toLocaleDateString(cfg.locale, { ...opts, timeZone: cfg.timezone });
}
