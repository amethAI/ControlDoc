export function countryToSlug(country: string): string {
  return country.toLowerCase()
    .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/\s+/g, '-');
}

export function recipientIdsForCountry(country: string): string[] {
  const slug = countryToSlug(country);
  return country === 'Panama' ? [slug, 'global', 'hr'] : [slug];
}

type Money = number | string;
const cents = (v: Money) => Math.round(Number(v) * 100);

export interface DotacionAsignacionRow {
  id: string;
  full_name: string;
  cuotas: number;
  monto_total: Money;
  estado: string;
  pagos: { numero_cuota: number; monto: Money }[];
}

export interface Issue { id?: string; full_name: string; problema: string }

export function findDotacionInconsistencies(rows: DotacionAsignacionRow[]): Issue[] {
  const issues: Issue[] = [];
  for (const a of rows) {
    const add = (problema: string) => issues.push({ id: a.id, full_name: a.full_name.trim(), problema });
    const distinctCuotas = new Set(a.pagos.map(p => p.numero_cuota)).size;
    const pagado = a.pagos.reduce((s, p) => s + cents(p.monto), 0);

    if (distinctCuotas < a.pagos.length) add('cuota duplicada');
    if (a.pagos.length > a.cuotas) add('más pagos que cuotas');
    // El endpoint redondea cada cuota a 2 decimales: se tolera 1 centavo por cuota
    if (pagado > cents(a.monto_total) + a.cuotas) add('sobrepago');

    const esperado = distinctCuotas === 0 ? 'pendiente' : distinctCuotas >= a.cuotas ? 'pagado' : 'parcial';
    if (a.estado !== esperado) add(`estado "${a.estado}" debería ser "${esperado}" (${distinctCuotas}/${a.cuotas} cuotas)`);
  }
  return issues;
}

export function findCountriesWithoutRecipients(
  activeEmployeesByCountry: Record<string, number>,
  recipientClubIds: string[],
): string[] {
  const have = new Set(recipientClubIds);
  return Object.entries(activeEmployeesByCountry)
    .filter(([country, n]) => n > 0 && !recipientIdsForCountry(country).some(id => have.has(id)))
    .map(([country]) => country);
}

export function findEmployeeCountryMismatches<T extends { employee_country_code: string; club_country_code: string }>(
  rows: T[],
): T[] {
  return rows.filter(r => r.employee_country_code !== r.club_country_code);
}
