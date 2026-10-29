import { supabase } from '../db.ts';
import { sendSimpleEmail, superAdminEmail } from './alertService.ts';
import {
  findDotacionInconsistencies,
  findCountriesWithoutRecipients,
  findEmployeeCountryMismatches,
  type Issue,
} from '../lib/integrityChecks.ts';

type JobResult = { success: boolean; error?: string } | void;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function logSystemEvent(actionType: string, entityName: string, description: string) {
  const { error } = await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    user_id: null,
    user_name: 'Sistema',
    action_type: actionType,
    action_description: description.slice(0, 4000),
    entity_type: 'Sistema',
    entity_id: null,
    entity_name: entityName,
    club_id: null,
    ip_address: null,
  });
  if (error) console.error('[OPS] No se pudo escribir audit_logs:', error.message);
}

async function notifyJobFailure(job: string, detail: string) {
  console.error(`[CRON] ${job} FALLÓ: ${detail}`);
  await logSystemEvent('Error de tarea programada', job, `${job}: ${detail}`);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px;">
      <h2 style="color:#b91c1c; font-size:16px;">Falló una tarea programada de ControlDoc</h2>
      <p><b>Tarea:</b> ${esc(job)}</p>
      <p><b>Detalle:</b> ${esc(detail)}</p>
      <p><b>Hora (UTC):</b> ${new Date().toISOString()}</p>
      <p style="color:#64748b; font-size:12px;">Revisá los logs de Render para el stack completo.</p>
    </div>`;
  await sendSimpleEmail([superAdminEmail()], `⚠️ ControlDoc — Falló: ${job}`, html, 'OPS')
    .catch(err => console.error('[OPS] No se pudo enviar el aviso de falla:', err));
}

// Las tareas de alertService atrapan sus errores y devuelven { success: false }; acá se convierten en aviso.
export async function runCronJob(job: string, fn: () => Promise<JobResult>, timeoutMs: number, benignErrors: string[] = []) {
  console.log(`[CRON] Ejecutando ${job}...`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: tardó más de ${timeoutMs / 1000}s`)), timeoutMs);
      }),
    ]);
    if (result && result.success === false && !benignErrors.includes(result.error ?? '')) {
      await notifyJobFailure(job, result.error || 'la tarea devolvió success=false');
      return;
    }
    console.log(`[CRON] ${job} OK`);
  } catch (err) {
    await notifyJobFailure(job, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

export interface IntegrityReport {
  dotacion: Issue[];
  paisesSinDestinatarios: string[];
  empleadosPaisIncorrecto: { full_name: string; employee_country_code: string; club_country_code: string }[];
  total: number;
}

export async function collectIntegrityReport(): Promise<IntegrityReport> {
  const [asigRes, empRes, recRes] = await Promise.all([
    supabase.from('dotacion_asignaciones')
      .select('id, cuotas, monto_total, estado, employees(full_name), dotacion_pagos(numero_cuota, monto, anulado_at)'),
    supabase.from('employees')
      .select('full_name, country_code, clubs(country, country_code)')
      .eq('status', 'activo'),
    supabase.from('alert_recipients').select('club_id'),
  ]);
  for (const r of [asigRes, empRes, recRes]) if (r.error) throw r.error;

  const dotacion = findDotacionInconsistencies((asigRes.data || []).map((a: any) => ({
    id: a.id,
    full_name: a.employees?.full_name || '(sin empleado)',
    cuotas: a.cuotas,
    monto_total: a.monto_total,
    estado: a.estado,
    pagos: (a.dotacion_pagos || []).filter((p: any) => !p.anulado_at),
  })));

  const activeByCountry: Record<string, number> = {};
  const empRows = (empRes.data || []).map((e: any) => {
    const country = e.clubs?.country;
    if (country) activeByCountry[country] = (activeByCountry[country] || 0) + 1;
    return { full_name: e.full_name, employee_country_code: e.country_code, club_country_code: e.clubs?.country_code };
  }).filter(e => e.club_country_code);

  const paisesSinDestinatarios = findCountriesWithoutRecipients(
    activeByCountry,
    (recRes.data || []).map((r: any) => r.club_id),
  );
  const empleadosPaisIncorrecto = findEmployeeCountryMismatches(empRows);

  return {
    dotacion,
    paisesSinDestinatarios,
    empleadosPaisIncorrecto,
    total: dotacion.length + paisesSinDestinatarios.length + empleadosPaisIncorrecto.length,
  };
}

function reportToHtml(r: IntegrityReport): string {
  const section = (title: string, items: string[]) => items.length === 0 ? '' :
    `<h3 style="font-size:14px; margin:16px 0 6px;">${esc(title)} (${items.length})</h3>
     <ul style="margin:0; padding-left:18px; font-size:13px;">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px;">
      <h2 style="color:#b45309; font-size:16px;">ControlDoc — ${r.total} problema(s) de integridad detectados</h2>
      ${section('Países con empleados activos sin destinatarios de alertas', r.paisesSinDestinatarios)}
      ${section('Dotación: estado inconsistente con los pagos', r.dotacion.map(i => `${i.full_name}: ${i.problema}`))}
      ${section('Empleados con país distinto al de su club', r.empleadosPaisIncorrecto.map(e => `${e.full_name}: ${e.employee_country_code} ≠ club ${e.club_country_code}`))}
    </div>`;
}

export async function runIntegrityCheck(): Promise<{ success: boolean; error?: string }> {
  const report = await collectIntegrityReport();
  if (report.total === 0) {
    console.log('[INTEGRITY] Sin problemas');
    return { success: true };
  }
  const summary = [
    report.paisesSinDestinatarios.length && `sin destinatarios: ${report.paisesSinDestinatarios.join(', ')}`,
    report.dotacion.length && `dotación inconsistente: ${report.dotacion.length}`,
    report.empleadosPaisIncorrecto.length && `país incorrecto: ${report.empleadosPaisIncorrecto.length}`,
  ].filter(Boolean).join(' | ');
  console.warn(`[INTEGRITY] ${report.total} problema(s): ${summary}`);
  await logSystemEvent('Chequeo de integridad', 'Integridad de datos', `${report.total} problema(s): ${summary}`);

  if (process.env.INTEGRITY_CHECK_EMAIL === 'true') {
    await sendSimpleEmail([superAdminEmail()], `⚠️ ControlDoc — ${report.total} problema(s) de integridad`, reportToHtml(report), 'INTEGRITY');
  }
  return { success: true };
}
