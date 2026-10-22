export function normalizeCedula(cedula: string): string {
  return cedula.trim().replace(/\s+/g, '-');
}
