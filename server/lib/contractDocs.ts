// Documentos cuyo vencimiento es el fin del contrato; el contrato del empleado manda sobre la fecha del formulario
const CONTRACT_TIED = ['contrato firmado', 'solicitud de entrada al club'];

export function isContractTiedDoc(docTypeName: string | null | undefined): boolean {
  const n = docTypeName?.toLowerCase() ?? '';
  return CONTRACT_TIED.some(t => n.includes(t));
}

export function resolveDocExpiry(i: {
  docTypeName: string | null | undefined;
  formExpiry: string | null | undefined;
  contractType: string | null | undefined;
  contractEnd: string | null | undefined;
}): string | null {
  const finite = !!i.contractEnd && i.contractType?.toLowerCase() !== 'indefinido';
  if (isContractTiedDoc(i.docTypeName) && finite) return i.contractEnd!.slice(0, 10);
  return i.formExpiry || null;
}
