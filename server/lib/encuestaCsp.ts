// Reglas de seguridad propias de la encuesta de datos: es la única página de ControlDoc que puede enviar a Formspree.
export const ENCUESTA_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  'connect-src https://formspree.io',
  'form-action https://formspree.io',
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');
