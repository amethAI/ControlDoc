export interface RequiredType { id: string; country_code: string | null }

export function findIncompleteEmployees(
  employees: { id: string; country_code: string | null }[],
  requiredTypes: RequiredType[],
  currentDocs: { employee_id: string; document_type_id: string }[],
): string[] {
  const has = new Set(currentDocs.map(d => `${d.employee_id}|${d.document_type_id}`));
  return employees
    .filter(e => requiredTypes
      .filter(t => t.country_code === null || t.country_code === e.country_code)
      .some(t => !has.has(`${e.id}|${t.id}`)))
    .map(e => e.id);
}
