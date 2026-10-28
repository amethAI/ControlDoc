export interface RequiredType { id: string; country_code: string | null }

export interface CurrentDoc { employee_id: string; document_type_id: string; file_url?: string | null }

export interface MissingDocuments { employee_id: string; missing: string[]; manualOnly: string[] }

// El Check List crea este registro cuando se escribe una fecha sin subir el archivo
export const MANUAL_ENTRY = 'manual_entry';

const isManual = (d: CurrentDoc) => d.file_url === MANUAL_ENTRY;

export function findMissingDocuments(
  employees: { id: string; country_code: string | null }[],
  requiredTypes: RequiredType[],
  currentDocs: CurrentDoc[],
): MissingDocuments[] {
  const withFile = new Set<string>();
  const manual = new Set<string>();
  for (const d of currentDocs) {
    const key = `${d.employee_id}|${d.document_type_id}`;
    if (isManual(d)) manual.add(key); else withFile.add(key);
  }
  const result: MissingDocuments[] = [];
  for (const e of employees) {
    const missing: string[] = [];
    const manualOnly: string[] = [];
    for (const t of requiredTypes) {
      if (t.country_code !== null && t.country_code !== e.country_code) continue;
      const key = `${e.id}|${t.id}`;
      if (withFile.has(key)) continue;
      missing.push(t.id);
      if (manual.has(key)) manualOnly.push(t.id);
    }
    if (missing.length > 0) result.push({ employee_id: e.id, missing, manualOnly });
  }
  return result;
}

export function findIncompleteEmployees(
  employees: { id: string; country_code: string | null }[],
  requiredTypes: RequiredType[],
  currentDocs: CurrentDoc[],
): string[] {
  return findMissingDocuments(employees, requiredTypes, currentDocs).map(r => r.employee_id);
}
