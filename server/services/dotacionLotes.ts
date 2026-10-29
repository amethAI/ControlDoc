// Lotes quincenales de dotación: qué se debe descontar, el Excel para RRHH y el registro de lo conciliado.
import { supabase } from '../db.ts';
import { pendingCuotas, estadoAsignacion, type Asignacion } from '../lib/dotacionConciliacion.ts';
import { buildConciliacionExcel, type FilaExcel } from '../lib/dotacionExcel.ts';

export interface Pendiente extends Asignacion {
  club: string;
  club_id: string | null;
  country: string | null;
  tanda: string;
  cantidad: number;
}

/** Asignaciones con saldo y sus cuotas activas (los pagos anulados no cuentan). */
export async function loadPendientes(): Promise<Pendiente[]> {
  const { data: asigs, error } = await supabase
    .from('dotacion_asignaciones')
    .select('id, cantidad, cuotas, monto_total, estado, employees(full_name, cedula), dotacion_tandas(descripcion, club_id, clubs(name, country))')
    .neq('estado', 'pagado');
  if (error) throw error;
  if (!asigs?.length) return [];

  const { data: pagos, error: pErr } = await supabase
    .from('dotacion_pagos')
    .select('asignacion_id, numero_cuota')
    .in('asignacion_id', asigs.map((a: any) => a.id))
    .is('anulado_at', null);
  if (pErr) throw pErr;

  const pagadas: Record<string, number[]> = {};
  for (const p of pagos || []) (pagadas[(p as any).asignacion_id] ||= []).push((p as any).numero_cuota);

  return asigs
    .map((a: any) => ({
      asignacion_id: a.id,
      nombre: a.employees?.full_name?.trim() || '',
      cedula: a.employees?.cedula || '',
      cuotas: a.cuotas,
      monto_total: Number(a.monto_total),
      pagadas: pagadas[a.id] || [],
      cantidad: a.cantidad,
      club: a.dotacion_tandas?.clubs?.name || '',
      club_id: a.dotacion_tandas?.club_id ?? null,
      country: a.dotacion_tandas?.clubs?.country ?? null,
      tanda: a.dotacion_tandas?.descripcion || '',
    }))
    .sort((x, y) => x.tanda.localeCompare(y.tanda) || x.nombre.localeCompare(y.nombre));
}

export function filasExcel(pendientes: Pendiente[]): FilaExcel[] {
  return pendientes.flatMap(p => {
    const next = pendingCuotas(p.cuotas, p.monto_total, p.pagadas)[0];
    if (!next) return [];
    return [{ asignacion_id: p.asignacion_id, nombre: p.nombre, cedula: p.cedula, club: p.club, tanda: p.tanda, cuota: `${next.numero} de ${p.cuotas}`, esperado: next.monto }];
  });
}

export async function getOrCreateLote(fechaQuincena: string) {
  const { error } = await supabase
    .from('dotacion_lotes')
    .upsert({ fecha_quincena: fechaQuincena }, { onConflict: 'fecha_quincena', ignoreDuplicates: true });
  if (error) throw error;
  const { data, error: selErr } = await supabase.from('dotacion_lotes').select('*').eq('fecha_quincena', fechaQuincena).single();
  if (selErr) throw selErr;
  return data as { id: string; fecha_quincena: string; estado: 'abierto' | 'conciliado' };
}

export async function excelForLote(lote: { id: string; fecha_quincena: string }, pendientes?: Pendiente[]) {
  const filas = filasExcel(pendientes ?? await loadPendientes());
  return { buffer: await buildConciliacionExcel(lote, filas), filas };
}

/** Recalcula el estado de cada asignación a partir de sus pagos activos. */
export async function recomputeEstados(asignacionIds: string[]): Promise<string[]> {
  if (!asignacionIds.length) return [];
  const [{ data: asigs, error }, { data: pagos, error: pErr }] = await Promise.all([
    supabase.from('dotacion_asignaciones').select('id, cuotas').in('id', asignacionIds),
    supabase.from('dotacion_pagos').select('asignacion_id, numero_cuota').in('asignacion_id', asignacionIds).is('anulado_at', null),
  ]);
  if (error) throw error;
  if (pErr) throw pErr;
  const fallidas: string[] = [];
  for (const a of asigs || []) {
    const nums = (pagos || []).filter((p: any) => p.asignacion_id === a.id).map((p: any) => p.numero_cuota);
    const { error: uErr } = await supabase.from('dotacion_asignaciones').update({ estado: estadoAsignacion(a.cuotas, nums) }).eq('id', a.id);
    if (uErr) fallidas.push(a.id);
  }
  return fallidas;
}
