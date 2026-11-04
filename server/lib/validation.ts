import { z } from 'zod';

// Fecha opcional: los formularios mandan '' o null cuando no hay fecha (por ejemplo, el fin de un contrato indefinido)
export const dateOrEmpty = z.preprocess(
  v => (v === '' || v === null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
);
