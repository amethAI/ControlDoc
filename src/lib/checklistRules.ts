const ymd = (s: string | null | undefined) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
};

// En Costa Rica el período de prueba es de 2 meses; al cumplirlos el contrato queda indefinido
export function probationMonths(country: string | null | undefined): number {
  return country === 'CR' || country === 'Costa Rica' ? 2 : 3;
}

export function probationEnd(contractStart: string | null | undefined, months = 3): string {
  const p = ymd(contractStart);
  if (!p) return '';
  return new Date(Date.UTC(p.y, p.mo - 1 + months, p.d)).toISOString().slice(0, 10);
}

export type ProbationStatus = 'cumplido' | 'por-terminar' | 'en-curso';

// Un período de prueba ya terminado no es un vencimiento: es un trámite cumplido
export function probationStatus(end: string | null | undefined, today = new Date()): ProbationStatus | null {
  if (!ymd(end)) return null;
  const diffDays = Math.ceil((new Date(`${end!.slice(0, 10)}T12:00:00`).getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'cumplido';
  if (diffDays <= 30) return 'por-terminar';
  return 'en-curso';
}

export function contractTerm(contractEnd: string | null | undefined, contractType: string | null | undefined): string {
  if (contractEnd) return contractEnd.slice(0, 10);
  return contractType?.toLowerCase() === 'indefinido' ? 'Indefinido' : '';
}
