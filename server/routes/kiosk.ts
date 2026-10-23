import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../db.ts';
import { getClubConfig } from '../lib/clubConfig.ts';
import { workDate, clockDrifted, LUNCH_LIMIT_MIN } from '../../src/lib/attendanceRules.ts';
import {
  hashToken,
  generateDeviceToken,
  readDeviceToken,
  markBatchSchema,
  computeMarkFlags,
  employeeEnablement,
} from '../lib/kioskLogic.ts';

const router = Router();
const DENIED = { error: 'Equipo no autorizado' };

async function deviceAuth(req: any, res: any, next: any) {
  const token = readDeviceToken(req.headers['authorization']);
  if (!token) return res.status(401).json(DENIED);
  const { data: device, error } = await supabase
    .from('kiosk_devices')
    .select('id, club_id, name')
    .eq('token_hash', hashToken(token))
    .is('revoked_at', null)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Error verificando el equipo' });
  if (!device) return res.status(401).json(DENIED);
  req.device = device;
  next();
}

async function enablementByEmployee(employees: any[], todayStr: string) {
  const ids = employees.map(e => e.id);
  const expired: Record<string, string[]> = {};
  if (ids.length > 0) {
    const { data: docs, error } = await supabase
      .from('employee_documents')
      .select('employee_id, document_types!inner(name, has_expiry)')
      .in('employee_id', ids)
      .eq('is_current', 1)
      .eq('document_types.has_expiry', 1)
      .not('expiry_date', 'is', null)
      .lt('expiry_date', todayStr);
    if (error) throw error;
    for (const d of docs || []) (expired[d.employee_id] ||= []).push((d.document_types as any).name);
  }
  const out: Record<string, { enabled: boolean; reason: string | null }> = {};
  for (const e of employees) {
    out[e.id] = employeeEnablement({
      contract_type: e.contract_type,
      contract_end: e.contract_end,
      cr_carne_vencimiento: e.cr_carne_vencimiento,
      expiredDocNames: expired[e.id] || [],
    }, todayStr);
  }
  return out;
}

router.post('/pair', async (req: any, res: any) => {
  const code = String(req.body?.code ?? '');
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Código inválido' });
  try {
    const { data: device, error } = await supabase
      .from('kiosk_devices')
      .select('id, name, club_id')
      .eq('pairing_code_hash', hashToken(code))
      .gt('pairing_expires_at', new Date().toISOString())
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!device) return res.status(401).json({ error: 'Código inválido o vencido' });

    const token = generateDeviceToken();
    const { error: updErr } = await supabase
      .from('kiosk_devices')
      .update({ token_hash: hashToken(token), paired_at: new Date().toISOString(), pairing_code_hash: null, pairing_expires_at: null })
      .eq('id', device.id);
    if (updErr) throw updErr;

    const club = await getClubConfig(device.club_id);
    res.json({ token, device: { id: device.id, name: device.name }, club: { id: device.club_id, name: club.name, timezone: club.timezone } });
  } catch (err) {
    console.error('[KIOSK] pair:', err);
    res.status(500).json({ error: 'Error al vincular el equipo' });
  }
});

router.get('/roster', deviceAuth, async (req: any, res: any) => {
  try {
    const device = req.device;
    const club = await getClubConfig(device.club_id);
    const todayStr = workDate(Date.now(), club.timezone);

    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, full_name, contract_type, contract_end, cr_carne_vencimiento')
      .eq('club_id', device.club_id)
      .eq('status', 'activo');
    if (empErr) throw empErr;
    const emps = employees || [];
    const ids = emps.map(e => e.id);

    const [badgesRes, marksRes, enablement] = await Promise.all([
      ids.length
        ? supabase.from('employee_badges').select('id, employee_id, code_hash, pin_hash, pin_salt, pin_iterations').in('employee_id', ids).is('revoked_at', null)
        : Promise.resolve({ data: [], error: null } as any),
      supabase.from('attendance_marks').select('id, employee_id, mark_type, marked_at').eq('club_id', device.club_id).eq('work_date', todayStr),
      enablementByEmployee(emps, todayStr),
    ]);
    if (badgesRes.error) throw badgesRes.error;
    if (marksRes.error) throw marksRes.error;

    const badgeByEmp = new Map((badgesRes.data || []).map((b: any) => [b.employee_id, b]));
    const marksByEmp: Record<string, { id: string; type: string; marked_at: string }[]> = {};
    for (const m of marksRes.data || []) (marksByEmp[m.employee_id] ||= []).push({ id: m.id, type: m.mark_type, marked_at: m.marked_at });

    const roster = emps
      .filter(e => badgeByEmp.has(e.id))
      .map(e => {
        const b: any = badgeByEmp.get(e.id);
        return {
          employee_id: e.id,
          name: e.full_name.trim(),
          badge_id: b.id,
          code_hash: b.code_hash,
          pin_hash: b.pin_hash,
          pin_salt: b.pin_salt,
          pin_iterations: b.pin_iterations,
          enabled: enablement[e.id].enabled,
          reason: enablement[e.id].reason,
          today: marksByEmp[e.id] || [],
        };
      });

    await supabase.from('kiosk_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);

    res.json({
      server_time: new Date().toISOString(),
      work_date: todayStr,
      club: { id: device.club_id, name: club.name, timezone: club.timezone },
      lunch_limit_min: LUNCH_LIMIT_MIN,
      employees: roster,
    });
  } catch (err) {
    console.error('[KIOSK] roster:', err);
    res.status(500).json({ error: 'Error al obtener la lista del club' });
  }
});

router.post('/marks', deviceAuth, async (req: any, res: any) => {
  const parsed = markBatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Lote inválido' });
  const batch = parsed.data;
  const device = req.device;
  const serverNow = Date.now();

  try {
    const club = await getClubConfig(device.club_id);
    const deviceNow = Date.parse(batch.device_now);
    const drifted = clockDrifted(deviceNow, serverNow);
    const offset = drifted ? serverNow - deviceNow : 0;

    const markIds = batch.marks.map(m => m.id);
    const empIds = [...new Set(batch.marks.map(m => m.employee_id))];
    const badgeIds = [...new Set(batch.marks.map(m => m.badge_id))];

    const [existingRes, empRes, badgeRes] = await Promise.all([
      supabase.from('attendance_marks').select('id').in('id', markIds),
      supabase.from('employees').select('id, club_id, contract_type, contract_end, cr_carne_vencimiento').in('id', empIds),
      supabase.from('employee_badges').select('id, employee_id, revoked_at').in('id', badgeIds),
    ]);
    for (const r of [existingRes, empRes, badgeRes]) if (r.error) throw r.error;

    const already = new Set((existingRes.data || []).map((m: any) => m.id));
    const empById = new Map((empRes.data || []).map((e: any) => [e.id, e]));
    const badgeById = new Map((badgeRes.data || []).map((b: any) => [b.id, b]));

    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    const fresh: { m: (typeof batch.marks)[number]; markedMs: number; workDay: string }[] = [];

    for (const m of batch.marks) {
      if (already.has(m.id)) { accepted.push(m.id); continue; }
      const emp = empById.get(m.employee_id);
      const badge = badgeById.get(m.badge_id);
      if (!emp || !badge || badge.employee_id !== m.employee_id) { rejected.push({ id: m.id, reason: 'gafete_invalido' }); continue; }
      const markedMs = Date.parse(m.device_time) + offset;
      fresh.push({ m, markedMs, workDay: workDate(markedMs, club.timezone) });
    }

    if (fresh.length > 0) {
      const days = [...new Set(fresh.map(f => f.workDay))];
      const freshEmpIds = [...new Set(fresh.map(f => f.m.employee_id))];
      const { data: dayRows, error: dayErr } = await supabase
        .from('attendance_marks')
        .select('employee_id, work_date, mark_type, marked_at')
        .in('employee_id', freshEmpIds)
        .in('work_date', days);
      if (dayErr) throw dayErr;

      const dayMarks: Record<string, { type: string; markedMs: number }[]> = {};
      for (const r of dayRows || []) (dayMarks[`${r.employee_id}|${r.work_date}`] ||= []).push({ type: r.mark_type, markedMs: Date.parse(r.marked_at) });

      const todayStr = workDate(serverNow, club.timezone);
      const enablement = await enablementByEmployee(freshEmpIds.map(id => empById.get(id)), todayStr);

      const rows: any[] = [];
      const presentes: any[] = [];
      for (const f of fresh.sort((a, b) => a.markedMs - b.markedMs)) {
        const emp = empById.get(f.m.employee_id);
        const key = `${f.m.employee_id}|${f.workDay}`;
        const list = (dayMarks[key] ||= []);
        const flags = computeMarkFlags({
          type: f.m.type,
          markedMs: f.markedMs,
          dayMarks: list,
          employeeEnabled: enablement[f.m.employee_id].enabled,
          badgeRevoked: !!badgeById.get(f.m.badge_id)?.revoked_at,
          drifted,
        });
        if (emp.club_id !== device.club_id) flags.push('otro_club');
        list.push({ type: f.m.type, markedMs: f.markedMs });
        rows.push({
          id: f.m.id,
          employee_id: f.m.employee_id,
          club_id: device.club_id,
          device_id: device.id,
          badge_id: f.m.badge_id,
          mark_type: f.m.type,
          marked_at: new Date(f.markedMs).toISOString(),
          device_time: f.m.device_time,
          work_date: f.workDay,
          flags,
        });
        if (f.m.type === 'entrada') {
          presentes.push({ id: crypto.randomUUID(), employee_id: f.m.employee_id, date: f.workDay, status: 'presente', updated_at: new Date().toISOString() });
        }
      }

      const { error: insErr } = await supabase.from('attendance_marks').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (insErr) throw insErr;
      accepted.push(...rows.map(r => r.id));

      if (presentes.length > 0) {
        // No pisa un permiso o incapacidad ya cargados ese día
        const { error: attErr } = await supabase.from('attendance').upsert(presentes, { onConflict: 'employee_id, date', ignoreDuplicates: true });
        if (attErr) console.error('[KIOSK] attendance presente:', attErr.message);
      }
    }

    await supabase.from('kiosk_devices').update({
      last_seen_at: new Date().toISOString(),
      last_pending: batch.pending ?? null,
      app_version: batch.app_version ?? null,
    }).eq('id', device.id);

    res.json({ accepted, rejected, server_time: new Date().toISOString() });
  } catch (err) {
    console.error('[KIOSK] marks:', err);
    res.status(500).json({ error: 'Error al registrar las marcas' });
  }
});

export default router;
