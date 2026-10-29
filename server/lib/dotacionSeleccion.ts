// Qué puede hacer una persona en el link de dotación según lo que ya eligió en esa tanda.
// Puede pedir más camisas solo cuando terminó de pagar todo lo anterior: nadie acumula deudas de dotación.

export interface AsigResumen {
  id: string;
  cantidad: number;
  cuotas: number;
  monto_total: number;
  estado: string;
  secuencia: number;
  pagosActivos: number;
}

export type ModoSeleccion =
  | { modo: 'nueva'; secuencia: 1 }
  | { modo: 'modificar'; asignacion: AsigResumen }
  | { modo: 'en_curso'; asignacion: AsigResumen }
  | { modo: 'adicional'; secuencia: number; pagadas: AsigResumen[] };

export function modoSeleccion(asigs: AsigResumen[]): ModoSeleccion {
  if (asigs.length === 0) return { modo: 'nueva', secuencia: 1 };

  const abiertas = asigs.filter(a => a.estado !== 'pagado');
  // Si hay algo sin terminar de pagar con descuentos aplicados, eso manda (aunque sea un pedido viejo reabierto)
  const enCurso = abiertas.find(a => a.pagosActivos > 0);
  if (enCurso) return { modo: 'en_curso', asignacion: enCurso };
  if (abiertas.length > 0) {
    const ultima = abiertas.reduce((x, y) => (y.secuencia > x.secuencia ? y : x));
    return { modo: 'modificar', asignacion: ultima };
  }
  return { modo: 'adicional', secuencia: Math.max(...asigs.map(a => a.secuencia)) + 1, pagadas: asigs };
}

export function camisasDisponibles(cantidadTotal: number | null, asignadas: number): number | null {
  return cantidadTotal == null ? null : Math.max(0, cantidadTotal - asignadas);
}

/** El primer pedido mantiene la ruta de siempre; los adicionales llevan su número para no pisar la autorización anterior. */
export function pdfPathFor(tandaId: string, employeeId: string, secuencia: number): string {
  return secuencia === 1 ? `${tandaId}/${employeeId}.pdf` : `${tandaId}/${employeeId}-${secuencia}.pdf`;
}
