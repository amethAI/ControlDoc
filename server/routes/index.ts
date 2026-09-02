import { Router } from 'express';
import { supabase } from '../db.ts';
import { sendExpirationAlerts, sendLoginAlert } from '../services/alertService.ts';
import { getClubConfig, invalidateClubConfig } from '../lib/clubConfig.ts';
import { getPersonalCombinedIds, getDocTypeIdBySlug } from '../lib/docTypes.ts';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

// ─── Zod validation schemas ───────────────────────────────────────────────────
const dateOrEmpty = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').or(z.literal('').transform(() => undefined)).optional();

const createEmployeeSchema = z.object({
  full_name:        z.string().min(2, 'Nombre requerido').max(120),
  cedula:           z.string().min(3, 'Cédula requerida').max(20),
  position:         z.string().max(100).optional(),
  contract_type:    z.string().max(50).optional(),
  contract_start:   dateOrEmpty,
  contract_end:     dateOrEmpty,
  birth_date:       dateOrEmpty,
  club_id:          z.string().min(1, 'Club requerido'),
  banco:            z.string().max(50).optional().nullable(),
  cuenta_bancaria:  z.string().max(50).optional().nullable(),
});

const createUserSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  name:     z.string().min(2, 'Nombre requerido').max(100),
  role:     z.enum(['Super Administrador', 'Administrador', 'Supervisor Interno', 'Coordinadora', 'Supervisor Cliente', 'Recursos Humanos', 'Asistente RRHH', 'Supervisora', 'Supervisora Redvolution', 'KAM Redvolution']),
  club_id:  z.string().optional().nullable(),
  country:  z.string().optional().nullable(),
});

const updateUserSchema = z.object({
  email:     z.string().email('Email inválido'),
  name:      z.string().min(2, 'Nombre requerido').max(100),
  role:      z.enum(['Super Administrador', 'Administrador', 'Supervisor Interno', 'Coordinadora', 'Supervisor Cliente', 'Recursos Humanos', 'Asistente RRHH', 'Supervisora', 'Supervisora Redvolution', 'KAM Redvolution']),
  password:  z.string().min(6).optional().or(z.literal('')).transform(v => v || undefined),
  club_id:   z.string().optional().nullable(),
  country:   z.string().optional().nullable(),
  is_active: z.number().int().min(0).max(1).optional(),
});
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Tipo de archivo no permitido. Solo se aceptan PDF, JPG, PNG, DOC, DOCX.'));
    }
    cb(null, true);
  },
});
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!['xlsx', 'xls'].includes(ext)) {
      return cb(new Error('Solo se aceptan archivos Excel (.xlsx, .xls)'));
    }
    cb(null, true);
  },
});

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET no está en .env — usando valor por defecto. Configuralo para producción.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Middleware to check if user is authenticated
const isAuthenticated = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = req.cookies?.token || (authHeader && authHeader.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, role, club_id, country, is_active')
      .eq('id', decoded.id)
      .single();

    if (!user || user.is_active === 0) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.warn(`[AUTH] Token inválido desde IP: ${req.headers['x-forwarded-for'] || req.socket?.remoteAddress}`);
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

// Middleware to check if user is Administrator (or Super Administrador)
const isAdmin = (req: any, res: any, next: any) => {
  if (!req.user || !['Administrador', 'Super Administrador'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. Solo el administrador puede realizar esta acción.' });
  }
  next();
};

// Middleware to check if user can view data (Employees, Attendance, Dashboard)
const canViewData = (req: any, res: any, next: any) => {
  const allowedRoles = ['Super Administrador', 'Administrador', 'Supervisor Interno', 'Supervisora', 'Supervisora Redvolution', 'KAM Redvolution', 'Coordinadora', 'Supervisor Cliente', 'Recursos Humanos', 'Asistente RRHH'];
  const user = (req as any).user;
  
  if (!user || !allowedRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. No tiene permisos para ver esta sección.' });
  }

  // Restriction: Supervisor Interno and Coordinadora must have a club assigned
  if ((user.role === 'Supervisor Interno' || user.role === 'Coordinadora') && !user.club_id) {
    return res.status(403).json({ error: 'Acceso denegado. No tiene un club asignado.' });
  }

  next();
};

// Middleware to check if user can modify data
const canModifyData = (req: any, res: any, next: any) => {
  const allowedRoles = ['Super Administrador', 'Administrador', 'Supervisor Interno', 'Supervisora', 'Supervisora Redvolution'];
  const user = (req as any).user;

  if (!user || !allowedRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. No tiene permisos para realizar modificaciones.' });
  }

  // Restriction: Supervisor Interno must have a club assigned
  // Supervisora without club_id = multi-club access (intentional)
  if (user.role === 'Supervisor Interno' && !user.club_id) {
    return res.status(403).json({ error: 'Acceso denegado. No tiene un club asignado.' });
  }

  next();
};

// Middleware to check if user is Internal (Admin or Internal Supervisor)
const isInternal = (req: any, res: any, next: any) => {
  const internalRoles = ['Super Administrador', 'Administrador', 'Supervisor Interno'];
  const user = (req as any).user;
  
  if (!user || !internalRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. Esta sección es privada para el equipo interno.' });
  }

  // Restriction: Supervisor Interno can only access their assigned club
  if (user.role === 'Supervisor Interno' && !user.club_id) {
    return res.status(403).json({ error: 'Acceso denegado. El supervisor no tiene un club asignado.' });
  }

  next();
};

// Middleware for service-to-service auth (Power Automate, etc.)
const isApiKey = (req: any, res: any, next: any) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.PA_API_KEY) {
    return res.status(401).json({ error: 'API key inválida o no proporcionada' });
  }
  next();
};

// ─── Access control helper ────────────────────────────────────────────────────
// Checks if a user can access a resource belonging to a specific club/country.
// Call AFTER fetching the resource so you have its club_id and country.
function canAccessResource(user: any, targetClubId: string | null, targetCountry?: string | null): boolean {
  const role = user.role;
  if (role === 'Super Administrador') return true;
  if (role === 'Administrador') {
    // Must match by country — both user and club must have a country set
    if (!user.country || !targetCountry) return false;
    return targetCountry === user.country;
  }
  if (role === 'Supervisor Interno' || role === 'Coordinadora') {
    return targetClubId === user.club_id;
  }
  if (role === 'Supervisora Redvolution' || role === 'Recursos Humanos' || role === 'Asistente RRHH' || role === 'Supervisor Cliente') {
    if (!user.country || !targetCountry) return false;
    return targetCountry === user.country;
  }
  // Supervisora: read access allowed (club-scoped at query level)
  return true;
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Shared country-scoping helper ────────────────────────────────────────────
// Resolves club_id / allowedClubIds / allowedEmployeeIds based on role.
// - Supervisor Interno / Coordinadora → single club_id from user profile
// - Administrador → all clubs in user.country (country-scoped list)
// - Super Administrador / others → no forced filter (use queryClubId if passed)
async function resolveClubScope(user: any, queryClubId?: string) {
  let club_id: string | undefined = undefined;
  let allowedClubIds: string[] | null = null;
  let allowedEmployeeIds: string[] | null = null;

  const CLUB_SCOPED_ROLES  = ['Supervisor Interno', 'Coordinadora', 'Supervisora'];
  const COUNTRY_SCOPED_ROLES = ['Administrador', 'Recursos Humanos', 'Asistente RRHH', 'Supervisor Cliente', 'Supervisora Redvolution'];

  if (CLUB_SCOPED_ROLES.includes(user.role)) {
    // Scoped to their assigned club only
    club_id = user.club_id;
  } else if (COUNTRY_SCOPED_ROLES.includes(user.role)) {
    // Scoped to all clubs in their country
    const countryVal = user.country || '__no_country__';
    const { data: countryClubs } = await supabase
      .from('clubs').select('id').eq('country', countryVal);
    const countryClubIds = (countryClubs || []).map((c: any) => c.id);

    // If a specific club was requested and it belongs to the user's country, scope to it
    if (queryClubId && countryClubIds.includes(queryClubId)) {
      club_id = queryClubId;
      const { data: scopedEmps } = await supabase
        .from('employees').select('id').eq('club_id', club_id);
      allowedEmployeeIds = (scopedEmps || []).map((e: any) => e.id);
    } else {
      allowedClubIds = countryClubIds;
      if (allowedClubIds.length > 0) {
        const { data: scopedEmps } = await supabase
          .from('employees').select('id').in('club_id', allowedClubIds);
        allowedEmployeeIds = (scopedEmps || []).map((e: any) => e.id);
      } else {
        allowedEmployeeIds = [];
      }
    }
  } else {
    // Super Administrador — no restriction, pass-through any explicit club filter
    club_id = queryClubId;
  }

  // Apply filter to a query on a direct club_id column
  const applyFilter = (q: any, field = 'club_id') => {
    if (club_id) return q.eq(field, club_id);
    if (allowedClubIds !== null) {
      return allowedClubIds.length > 0 ? q.in(field, allowedClubIds) : q.in(field, ['__none__']);
    }
    return q;
  };

  // Apply filter to employee_documents (uses employee_id to avoid nested .in() bug)
  const applyDocFilter = (q: any) => {
    if (club_id) return q.eq('employees.club_id', club_id);
    if (allowedEmployeeIds !== null) {
      return allowedEmployeeIds.length > 0 ? q.in('employee_id', allowedEmployeeIds) : q.in('employee_id', ['__none__']);
    }
    return q;
  };

  return { club_id, allowedClubIds, allowedEmployeeIds, applyFilter, applyDocFilter };
}
// ──────────────────────────────────────────────────────────────────────────────

// Performance Routes
router.get('/performance', isAuthenticated, isInternal, async (req, res) => {
  const { date, club_id: queryClubId } = req.query;
  const user = (req as any).user;
  
  // If user is Supervisor Interno, they can only see their club
  const club_id = user.role === 'Supervisor Interno' ? user.club_id : queryClubId;
  
  try {
    let query = supabase
      .from('daily_performance')
      .select('*');
    
    if (date) query = query.eq('date', date);
    if (club_id) query = query.eq('club_id', club_id);
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching performance:', error);
    res.status(500).json({ error: 'Error al obtener datos de rendimiento' });
  }
});

router.post('/performance', isAuthenticated, isInternal, async (req, res) => {
  const records = Array.isArray(req.body) ? req.body : [req.body];
  const user = (req as any).user;
  
  // If user is Supervisor Interno, they can only save data for their club
  if (user.role === 'Supervisor Interno') {
    const invalidRecord = records.find((r: any) => r.club_id !== user.club_id);
    if (invalidRecord) {
      return res.status(403).json({ error: 'Acceso denegado. Solo puede registrar datos para su club asignado.' });
    }
  }
  
  try {
    const cleanRecords = records.map((r: any) => {
      const { employee, ...rest } = r;
      return {
        ...rest,
        created_by: user.id,
        updated_at: new Date().toISOString()
      };
    });

    const { data, error } = await supabase
      .from('daily_performance')
      .upsert(cleanRecords, { onConflict: 'date,employee_id,club_id' });

    if (error) throw error;
    res.json({ message: 'Datos guardados correctamente', data });
  } catch (error: any) {
    console.error('Error saving performance:', error);
    res.status(500).json({ error: 'Error al guardar datos de rendimiento' });
  }
});

router.get('/performance/stats', isAuthenticated, isInternal, async (req, res) => {
  const user = (req as any).user;
  
  try {
    let query = supabase
      .from('daily_performance')
      .select('meta, actual_sales, date');
    
    // If user is Supervisor Interno, filter by their club
    if (user.role === 'Supervisor Interno') {
      query = query.eq('club_id', user.club_id);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Simple aggregation for dashboard
    const stats = data.reduce((acc: any, curr: any) => {
      acc.totalMeta += curr.meta || 0;
      acc.totalVentas += curr.actual_sales || 0;
      return acc;
    }, { totalMeta: 0, totalVentas: 0 });
    
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// Simple auth endpoint — enriches user with club locale/timezone for the frontend
router.get('/auth/me', isAuthenticated, async (req, res) => {
  const user = (req as any).user;
  let club_locale = process.env.APP_DEFAULT_LOCALE || 'es-PA';
  let club_timezone = process.env.APP_DEFAULT_TIMEZONE || 'America/Panama';
  if (user.club_id) {
    const cfg = await getClubConfig(user.club_id).catch(() => null);
    if (cfg) { club_locale = cfg.locale; club_timezone = cfg.timezone; }
  }
  res.json({ user: { ...user, club_locale, club_timezone } });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) {
      if (error.message === 'Supabase not configured') {
        return res.status(500).json({ error: 'La base de datos (Supabase) no está configurada. Por favor, verifica las variables de entorno.' });
      }
      if (error.code !== 'PGRST116') {
        throw error;
      }
    }

    // Verify bcrypt-hashed password only
    const isValidPassword = user &&
      user.password_hash?.startsWith('$2') &&
      await bcrypt.compare(password, user.password_hash);
    
    if (user && isValidPassword) {
      console.log(`Login exitoso para: ${email}`);

      // Generate JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role, club_id: user.club_id, country: user.country || null },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });

      const loginIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

      // Log login event to audit_logs
      supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        user_name: user.name,
        action_type: 'Inicio de sesión',
        action_description: `${user.name} (${user.role}) inició sesión`,
        entity_type: 'Usuario',
        entity_id: user.id,
        entity_name: user.email,
        club_id: user.club_id || null,
        ip_address: loginIp
      }).then(({ error }) => { if (error) console.error('Error logging login:', error); });

      // Send login alert (fire-and-forget)
      sendLoginAlert('success', {
        name: user.name,
        email: user.email,
        role: user.role,
        club_id: user.club_id || null,
        ip: loginIp,
        timestamp: new Date()
      }).catch(err => console.error('[LOGIN ALERT] success:', err));

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          club_id: user.club_id,
          country: user.country || null
        }
      });
    } else {
      const failedIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
      console.warn(`[AUTH] Login fallido para: ${email} desde IP: ${failedIp}`);

      // Log failed attempt to audit_logs
      supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user?.id || null,
        user_name: user?.name || email,
        action_type: 'Inicio de sesión fallido',
        action_description: `Intento de acceso fallido para: ${email}`,
        entity_type: 'Usuario',
        entity_id: user?.id || null,
        entity_name: email,
        club_id: user?.club_id || null,
        ip_address: failedIp
      }).then(({ error }) => { if (error) console.error('Error logging failed login:', error); });

      // Send failed login alert (fire-and-forget)
      sendLoginAlert('failed', {
        name: user?.name || 'Desconocido',
        email,
        role: user?.role,
        club_id: user?.club_id || null,
        ip: failedIp,
        timestamp: new Date()
      }).catch(err => console.error('[LOGIN ALERT] failed:', err));

      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (error) {
    console.error('Error en el proceso de login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ success: true });
});

// ─── GET /employees-for-sheet ────────────────────────────────────────────────
// Used by Google Apps Script to auto-populate employee names.
// Auth: SHEET_API_KEY env var (no session required).
router.get('/employees-for-sheet', async (req: any, res: any) => {
  const key = (req.headers['x-sheet-key'] as string) || (req.query.key as string);
  if (!key || key !== process.env.SHEET_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { club_id } = req.query;
  if (!club_id) return res.status(400).json({ error: 'club_id requerido' });

  const { data, error } = await supabase
    .from('employees')
    .select('full_name')
    .eq('club_id', club_id as string)
    .eq('status', 'activo')
    .order('full_name');

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ names: (data || []).map((e: any) => e.full_name) });
});

// Apply authentication middleware to all routes below
router.use(isAuthenticated);

// Helper to log audit actions
const logAudit = async (
  req: any,
  actionType: string,
  actionDescription: string,
  entityType: string,
  entityId: string | null,
  entityName: string | null,
  clubId: string | null
) => {
  try {
    const userId = req.user?.id || null;
    const userName = req.user?.name || 'Sistema';
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: userId || null,
      user_name: userName || 'Sistema',
      action_type: actionType,
      action_description: actionDescription,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      club_id: clubId,
      ip_address: ipAddress
    });
  } catch (err) {
    console.error('Error logging audit action:', err);
  }
};

// Get access logs (login history — successful and failed)
router.get('/access-logs', isAdmin, async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('id, created_at, user_name, entity_name, club_id, ip_address, action_type')
      .in('action_type', ['Inicio de sesión', 'Inicio de sesión fallido'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    res.json(logs);
  } catch (error) {
    console.error('Error fetching access logs:', error);
    res.status(500).json({ error: 'Error al obtener historial de accesos' });
  }
});

// Get audit logs
router.get('/audit-logs', isAdmin, async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get all clubs
router.get('/clubs', isAuthenticated, async (req, res) => {
  try {
    const user = (req as any).user;
    let query = supabase.from('clubs').select('*').neq('id', 'global');

    if (['Supervisor Interno', 'Coordinadora', 'Supervisora'].includes(user.role)) {
      // Club-scoped: only their assigned club
      query = query.eq('id', user.club_id);
    } else if (['Administrador', 'Recursos Humanos', 'Asistente RRHH', 'Supervisor Cliente', 'Supervisora Redvolution'].includes(user.role) && user.country) {
      // Country-scoped: only clubs in their country
      query = query.eq('country', user.country);
    }
    // Super Administrador: no filter — sees all clubs

    const { data: clubs, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(clubs || []);
  } catch (error: any) {
    console.error('Error in /clubs:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get single club
router.get('/clubs/:id', isAuthenticated, async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: club, error } = await supabase.from('clubs').select('*').eq('id', req.params.id).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    if (!club) return res.status(404).json({ error: 'Club no encontrado' });

    if (!canAccessResource(user, club.id, club.country)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    res.json(club);
  } catch (error: any) {
    console.error('Error in /clubs/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Create club
router.post('/clubs', isAdmin, async (req, res) => {
  const { name, description, address, country } = req.body;
  
  try {
    const id = crypto.randomUUID();
    const { data: newClub, error } = await supabase
      .from('clubs')
      .insert([{ id, name, description, address, country: country || null }])
      .select()
      .single();
      
    if (error) {
      if (error.code === '23505') { // Unique violation in Postgres
        return res.status(400).json({ error: 'Ya existe un club con este nombre' });
      }
      throw error;
    }
    
    // Log audit
    await logAudit(
      req,
      'Creación de club',
      `Club creado: ${name}`,
      'Club', id, name, id
    );
    
    res.status(201).json(newClub);
  } catch (error: any) {
    console.error('Error creating club:', error);
    res.status(500).json({ error: 'Error al crear club' });
  }
});

// Get employees
router.get('/employees', canViewData, async (req, res) => {
  try {
    const { club_id: queryClubId, status } = req.query;
    const user = (req as any).user;

    const { applyFilter } = await resolveClubScope(user, queryClubId as string | undefined);

    let query = supabase.from('employees').select('*').order('full_name', { ascending: true });
    query = applyFilter(query);

    if (status) query = query.eq('status', status);

    const { data: employees, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(employees);
  } catch (error: any) {
    console.error('Error in /employees:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/employees/export — read-only export for Power Query / Excel master
// Auth: x-api-key header (PA_API_KEY). Returns JSON array with employee payroll fields.
router.get('/employees/export', isApiKey, async (req: any, res: any) => {
  try {
    const { club_id } = req.query;

    let empQuery = supabase
      .from('employees')
      .select('full_name, banco, cuenta_bancaria, contract_start, club_id')
      .eq('status', 'activo')
      .order('full_name');
    if (club_id) empQuery = empQuery.eq('club_id', club_id as string);

    const { data: employees, error: empErr } = await empQuery;
    if (empErr) return res.status(500).json({ error: empErr.message });

    const { data: clubs } = await supabase.from('clubs').select('id, name');
    const clubMap = new Map((clubs || []).map((c: any) => [c.id, c.name]));

    const result = (employees || []).map((e: any) => ({
      nombre: e.full_name,
      banco: e.banco || '',
      cuenta: e.cuenta_bancaria || '',
      fecha_ingreso: e.contract_start || '',
      club: clubMap.get(e.club_id) || e.club_id || '',
      club_id: e.club_id || '',
    }));

    res.json(result);
  } catch (err: any) {
    console.error('[employees/export]', err);
    res.status(500).json({ error: err?.message || 'Error interno' });
  }
});

// Create employee
router.post('/employees', canModifyData, async (req, res) => {
  const user = (req as any).user;

  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { full_name, cedula, position, contract_type, contract_start, contract_end, birth_date, club_id, banco, cuenta_bancaria } = parsed.data;

  // Restriction: Supervisor Interno can only create for their club
  if (user.role === 'Supervisor Interno' && club_id !== user.club_id) {
    return res.status(403).json({ error: 'Acceso denegado. Solo puede crear empleados para su club asignado.' });
  }

  try {
    const id = crypto.randomUUID();
    const { data: newEmployee, error } = await supabase
      .from('employees')
      .insert([{
        id, full_name, cedula, position, contract_type,
        contract_start:   contract_start   || null,
        contract_end:     contract_end     || null,
        birth_date:       birth_date       || null,
        banco:            banco            || null,
        cuenta_bancaria:  cuenta_bancaria  || null,
        club_id, status: 'activo'
      }])
      .select()
      .single();
      
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Ya existe un empleado con esta cédula' });
      }
      throw error;
    }
    
    // Log audit
    await logAudit(
      req,
      'Creación de empleado',
      `Empleado creado: ${full_name} (${cedula})`,
      'Empleado', id, full_name, club_id
    );

    res.status(201).json(newEmployee);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear empleado' });
  }
});

// GET /api/employees/birthdays — MUST be before /employees/:id to avoid route shadowing
router.get('/employees/birthdays', canViewData, async (req, res) => {
  const { month, club_id: queryClubId } = req.query;
  const user = (req as any).user;

  const { applyFilter } = await resolveClubScope(user, queryClubId as string | undefined);

  let query = supabase
    .from('employees')
    .select('id, full_name, birth_date, club_id')
    .not('birth_date', 'is', null)
    .order('birth_date', { ascending: true });

  query = applyFilter(query);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const { data: clubs } = await supabase.from('clubs').select('id, name');
  const clubMap = new Map((clubs || []).map((c: any) => [c.id, c.name]));

  const employees = (data || []).map((e: any) => ({
    ...e,
    clubs: clubMap.has(e.club_id) ? { name: clubMap.get(e.club_id) } : null,
  }));

  const filtered = month
    ? employees.filter((e: any) => new Date(e.birth_date + 'T12:00:00').getMonth() + 1 === Number(month))
    : employees;

  res.json(filtered);
});

// Get single employee
router.get('/employees/:id', isAuthenticated, async (req, res) => {
  const user = (req as any).user;
  try {
    // Join clubs to get country for Administrador scoping check
    const { data: employee, error } = await supabase
      .from('employees')
      .select('*, clubs(country)')
      .eq('id', req.params.id)
      .single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

    const clubCountry = (employee.clubs as any)?.country ?? null;
    if (!canAccessResource(user, employee.club_id, clubCountry)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    // Strip the joined clubs field before returning (not part of the employee schema)
    const { clubs, ...emp } = employee as any;
    res.json(emp);
  } catch (error: any) {
    console.error('Error in /employees/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Update employee basic info
router.patch('/employees/:id', canModifyData, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const updateSchema = z.object({
    full_name:        z.string().min(2, 'Nombre requerido').max(120).optional(),
    cedula:           z.string().min(3, 'Cédula requerida').max(20).optional(),
    position:         z.string().max(100).optional(),
    contract_type:    z.string().max(50).optional(),
    contract_start:   dateOrEmpty,
    contract_end:     dateOrEmpty,
    birth_date:       dateOrEmpty,
    club_id:          z.string().min(1).optional(),
    banco:            z.string().max(50).optional().nullable(),
    cuenta_bancaria:  z.string().max(50).optional().nullable(),
  });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    // Fetch employee to verify access
    const { data: emp, error: fetchErr } = await supabase
      .from('employees')
      .select('*, clubs(country)')
      .eq('id', id)
      .single();

    if (fetchErr || !emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const clubCountry = (emp.clubs as any)?.country ?? null;
    if (!canAccessResource(user, emp.club_id, clubCountry)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    // Supervisor Interno can only edit employees in their own club
    if (user.role === 'Supervisor Interno' && emp.club_id !== user.club_id) {
      return res.status(403).json({ error: 'Acceso denegado. Solo puede editar empleados de su club.' });
    }

    const { clubs: _clubs, ...cleanEmp } = emp as any;
    const updates = { ...parsed.data };
    // Prevent changing club_id for non-admins
    if (user.role === 'Supervisor Interno') delete updates.club_id;

    const { data: updated, error } = await supabase
      .from('employees')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Sync contract_end → expiry_date for "Contrato firmado" and "Solicitud de entrada al club"
    if ('contract_end' in updates && updates.contract_end) {
      const { data: allDocTypes } = await supabase.from('document_types').select('id, name');
      const contractDocTypeIds = (allDocTypes || [])
        .filter((dt: any) => ['Contrato firmado', 'Solicitud de entrada al club'].some(n => dt.name?.toLowerCase().includes(n.toLowerCase())))
        .map((dt: any) => dt.id);
      if (contractDocTypeIds.length > 0) {
        await supabase
          .from('employee_documents')
          .update({ expiry_date: updates.contract_end })
          .eq('employee_id', id)
          .in('document_type_id', contractDocTypeIds)
          .eq('is_current', 1);
      }
    }

    // Invalidate dashboard cache so changes are visible immediately
    dashboardCache.clear();

    await logAudit(req, 'Actualización de empleado', `Empleado actualizado: ${updated.full_name}`, 'Empleado', id, updated.full_name, updated.club_id);

    res.json(updated);
  } catch (error: any) {
    console.error('Error in PATCH /employees/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get document types
router.get('/document-types', isAuthenticated, async (req: any, res) => {
  try {
    const user = req.user;
    const cfg = user.club_id ? await getClubConfig(user.club_id).catch(() => null) : null;
    const countryCode = cfg?.country_code ?? 'PA';

    let query = supabase.from('document_types').select('*').eq('is_active', 1).order('sort_order');
    // Filter by country: show types matching the user's country OR universal types (null)
    query = query.or(`country_code.eq.${countryCode},country_code.is.null`);

    const { data: types, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const processedTypes = types?.map(type => {
      if (type.is_combined_personal === 1 || type.is_hidden === 1) return null;
      return type;
    }).filter(Boolean) || [];

    // Panama only: virtual combined "Documentos Personales" type
    if (countryCode === 'PA') {
      processedTypes.unshift({
        id: 'doc-personal-combined',
        name: 'Documentos Personales',
        description: 'Archivo unificado con Cédula, Carnet Verde y Carnet Blanco',
        has_expiry: 1,
        is_required: 1,
        is_active: 1,
        sort_order: 0
      });
    }

    res.json(processedTypes);
  } catch (error: any) {
    console.error('Error in /document-types:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get employee documents
router.get('/employees/:id/documents', isAuthenticated, async (req, res) => {
  const user = (req as any).user;
  try {
    // Verify the employee exists and user has access to their club
    const { data: emp } = await supabase
      .from('employees')
      .select('club_id, clubs(country)')
      .eq('id', req.params.id)
      .single();

    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const clubCountry = (emp.clubs as any)?.country ?? null;
    if (!canAccessResource(user, emp.club_id, clubCountry)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const { data: documents, error } = await supabase
      .from('employee_documents')
      .select('*, document_types(id, name, is_combined_personal)')
      .eq('employee_id', req.params.id)
      .eq('is_current', 1);

    if (error) return res.status(500).json({ error: error.message });
    res.json(documents);
  } catch (error: any) {
    console.error('Error in /employees/:id/documents:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Create document (upload)
router.post('/documents', canModifyData, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo es demasiado grande (límite 10MB)' });
      }
      return res.status(400).json({ error: `Error al subir archivo: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const { employee_id, document_type_id, expiry_date, status } = req.body;
  const file = req.file;
  
  if (!file) {
    return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' });
  }

  const file_name = file.originalname;
  const file_size_kb = Math.round(file.size / 1024);
  
  try {
    const id = crypto.randomUUID();
    
    // Upload to Supabase Storage
    const fileExt = file_name.split('.').pop();
    const filePath = `${employee_id}/${id}.${fileExt}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (uploadError) {
      console.error('Supabase storage error:', uploadError);
      throw new Error(`Error al subir archivo a storage: ${uploadError.message}`);
    }

    // Store only the storage path — access via signed URLs through /api/documents/:id/view
    const file_url = filePath;
    
    // Handle the special 'doc-personal-combined' type
    if (document_type_id === 'doc-personal-combined') {
      const personalIds = await getPersonalCombinedIds();
      if (personalIds.length === 0) {
        return res.status(500).json({ error: 'No hay tipos de documento personales configurados' });
      }

      // Mark previous versions as not current for all combined personal types
      const { error: updateCombinedError } = await supabase
        .from('employee_documents')
        .update({ is_current: 0 })
        .eq('employee_id', employee_id)
        .in('document_type_id', personalIds);
      if (updateCombinedError) throw updateCombinedError;

      const [carnetBlancoId, carnetVerdeId, cedulaId] = await Promise.all([
        getDocTypeIdBySlug('carnet-blanco'),
        getDocTypeIdBySlug('carnet-verde'),
        getDocTypeIdBySlug('cedula'),
      ]);

      const docsToInsert = [
        ...(carnetBlancoId ? [{ id: crypto.randomUUID(), employee_id, document_type_id: carnetBlancoId, file_url, file_name, file_size_kb, expiry_date: expiry_date || null, status, is_current: 1 }] : []),
        ...(carnetVerdeId  ? [{ id: crypto.randomUUID(), employee_id, document_type_id: carnetVerdeId,  file_url, file_name, file_size_kb, expiry_date: expiry_date || null, status, is_current: 1 }] : []),
        ...(cedulaId       ? [{ id: crypto.randomUUID(), employee_id, document_type_id: cedulaId,       file_url, file_name, file_size_kb, expiry_date: null, status: 'sin_fecha', is_current: 1 }] : []),
      ];

      const { data: newDocs, error } = await supabase
        .from('employee_documents')
        .insert(docsToInsert)
        .select();
        
      if (error) throw error;
      
      // Log audit
      await logAudit(
        req,
        'Carga de documento',
        `Documento unificado subido: ${file_name}`,
        'Documento', id, file_name, null
      );
      
      return res.status(201).json(newDocs[0]); // Return one of them to satisfy the frontend
    }

    // Mark previous versions as not current
    const { error: updateError } = await supabase
      .from('employee_documents')
      .update({ is_current: 0 })
      .eq('employee_id', employee_id)
      .eq('document_type_id', document_type_id);
    if (updateError) throw updateError;

    // Insert document record — is_current: 1 set explicitly, never rely on DB default
    const { data: newDoc, error } = await supabase
      .from('employee_documents')
      .insert([{
        id, employee_id, document_type_id, file_url, file_name, file_size_kb, expiry_date: expiry_date || null, status, is_current: 1
      }])
      .select()
      .single();
      
    if (error) throw error;
    
    // Log audit
    await logAudit(
      req,
      'Carga de documento',
      `Documento subido: ${file_name}`,
      'Documento', id, file_name, null
    );
    
    res.status(201).json(newDoc);
  } catch (error: any) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Error al subir documento', details: error?.message || String(error) });
  }
});

// Update document (e.g., expiry date)
router.patch('/documents/:id', canModifyData, async (req, res) => {
  const { expiry_date } = req.body;
  
  try {
    const { data: updatedDoc, error } = await supabase
      .from('employee_documents')
      .update({ expiry_date })
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    res.json(updatedDoc);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar documento' });
  }
});

// Return a short-lived Supabase signed URL for a document (used by frontend to open in new tab)
router.get('/documents/:docId/signed-url', isAuthenticated, async (req: any, res: any) => {
  const { docId } = req.params;
  const user = req.user;

  const { data: doc, error } = await supabase
    .from('employee_documents')
    .select('id, file_url, file_name, employee_id')
    .eq('id', docId)
    .single();

  if (error || !doc) return res.status(404).json({ error: 'Documento no encontrado' });

  // Authorization: verify user has access to the employee's club
  const { data: emp } = await supabase
    .from('employees')
    .select('club_id, clubs(country)')
    .eq('id', doc.employee_id)
    .single();

  if (emp && !canAccessResource(user, emp.club_id, (emp.clubs as any)?.country ?? null)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  // Legacy local uploads
  if (doc.file_url.startsWith('/uploads/')) {
    return res.json({ url: doc.file_url, fileName: doc.file_name });
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.file_url, 900, { download: false }); // 15 min (reduced from 1h)

  if (signedError || !signedData) {
    return res.status(500).json({ error: 'Error al generar URL del documento' });
  }

  res.json({ url: signedData.signedUrl, fileName: doc.file_name });
});

// Download document content (used server-side for ZIP generation)
router.get('/documents/:docId/download', isAuthenticated, async (req: any, res: any) => {
  const { docId } = req.params;
  const user = req.user;

  const { data: doc, error } = await supabase
    .from('employee_documents')
    .select('id, file_url, file_name, employee_id')
    .eq('id', docId)
    .single();

  if (error || !doc) return res.status(404).json({ error: 'Documento no encontrado' });

  // Authorization: verify user has access to the employee's club
  const { data: emp } = await supabase
    .from('employees')
    .select('club_id, clubs(country)')
    .eq('id', doc.employee_id)
    .single();

  if (emp && !canAccessResource(user, emp.club_id, (emp.clubs as any)?.country ?? null)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  if (doc.file_url.startsWith('/uploads/')) {
    return res.redirect(doc.file_url);
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.file_url, 60);

  if (signedError || !signedData) {
    return res.status(500).json({ error: 'Error al generar URL del documento' });
  }

  res.redirect(signedData.signedUrl);
});

// Delete document
router.delete('/employees/:employeeId/documents/:typeId', canModifyData, async (req, res) => {
  const { employeeId, typeId } = req.params;
  
  try {
    let typeIdsToDelete = [typeId];
    if (typeId === 'doc-personal-combined') {
      typeIdsToDelete = await getPersonalCombinedIds();
    }

    // Mark as not current instead of hard delete to keep history
    const { error } = await supabase
      .from('employee_documents')
      .update({ is_current: 0 })
      .eq('employee_id', employeeId)
      .in('document_type_id', typeIdsToDelete)
      .eq('is_current', 1);
      
    if (error) throw error;
    
    // Log audit
    await logAudit(
      req,
      'Eliminación de documento',
      `Documento(s) eliminado(s) para tipo: ${typeId}`,
      'Documento', employeeId, null, null
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
});

// Import document dates from Excel/CSV
router.post('/import-document-dates', canModifyData, async (req, res) => {
  const { records } = req.body; // Array of { name: string, carnetVerde: string, carnetBlanco: string }
  
  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'Formato inválido. Se esperaba un array de registros.' });
  }

  try {
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Get all active employees to match by name
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, contract_start')
      .eq('status', 'activo');

    if (empError) throw empError;
    
    // Get contract-tied document types
    const { data: docTypes } = await supabase
      .from('document_types')
      .select('id, name');
      
    // Documentos cuya fecha de vencimiento = fecha FIN de contrato
    const contractEndTiedDocTypeIds = docTypes
      ?.filter(dt => ['Contrato firmado', 'Solicitud de entrada al club'].some(name => dt.name.includes(name)))
      .map(dt => dt.id) || [];

    // Documentos cuya fecha = fecha INICIO de contrato (aviso CSS se archiva el día que entra)
    const contractStartTiedDocTypeIds = docTypes
      ?.filter(dt => ['Afiliación CSS', 'Aviso de entrada'].some(name => dt.name.includes(name)))
      .map(dt => dt.id) || [];

    for (const record of records) {
      if (!record.name) continue;
      
      // Find employee by name (case-insensitive, trim spaces)
      const employee = employees.find(e => 
        e.full_name.toLowerCase().trim() === record.name.toLowerCase().trim()
      );

      if (!employee) {
        errorCount++;
        errors.push(`Empleado no encontrado: ${record.name}`);
        continue;
      }

      // Update Carnet Verde
      if (record.carnetVerde) {
        const cvId = await getDocTypeIdBySlug('carnet-verde');
        if (cvId) {
          await supabase
            .from('employee_documents')
            .update({ expiry_date: record.carnetVerde })
            .eq('employee_id', employee.id)
            .eq('document_type_id', cvId)
            .eq('is_current', 1);
        }
      }

      // Update Carnet Blanco
      if (record.carnetBlanco) {
        const cbId = await getDocTypeIdBySlug('carnet-blanco');
        if (cbId) {
          await supabase
            .from('employee_documents')
            .update({ expiry_date: record.carnetBlanco })
            .eq('employee_id', employee.id)
            .eq('document_type_id', cbId)
            .eq('is_current', 1);
        }
      }
      
      // Update Contract Type and End Date
      const updateData: any = {};
      
      if (record.fechaInicioContrato) {
        updateData.contract_start = record.fechaInicioContrato;
      }

      if (record.tipoContrato) {
        updateData.contract_type = record.tipoContrato;
      }
      
      if (record.tipoContrato && (record.tipoContrato.toUpperCase() === 'INDEFINIDA' || record.tipoContrato.toUpperCase() === 'INDEFINIDO')) {
        updateData.contract_end = null;
      } else if (record.fechaTerminacionContrato) {
        updateData.contract_end = record.fechaTerminacionContrato;
      } else if (record.tipoContrato && (record.tipoContrato.toUpperCase() === '1 AÑO' || record.tipoContrato.toUpperCase() === '1 ANO')) {
        // Auto-calculate 1 year from contract_start if not provided
        const startToUse = record.fechaInicioContrato || employee.contract_start;
        if (startToUse) {
          const start = new Date(startToUse);
          start.setFullYear(start.getFullYear() + 1);
          updateData.contract_end = start.toISOString().split('T')[0];
        }
      }

      if (Object.keys(updateData).length > 0) {
        console.log(`Updating employee ${employee.id} with:`, updateData);
        await supabase
          .from('employees')
          .update(updateData)
          .eq('id', employee.id);
          
        // Documentos atados al fin de contrato (contrato firmado, solicitud)
        if (contractEndTiedDocTypeIds.length > 0 && ('contract_end' in updateData)) {
          await supabase
            .from('employee_documents')
            .update({ expiry_date: updateData.contract_end })
            .eq('employee_id', employee.id)
            .in('document_type_id', contractEndTiedDocTypeIds)
            .eq('is_current', 1);
        }

        // Documentos atados al inicio de contrato (Aviso CSS, Afiliación CSS)
        const startDate = updateData.contract_start || employee.contract_start;
        if (contractStartTiedDocTypeIds.length > 0 && startDate) {
          await supabase
            .from('employee_documents')
            .update({ expiry_date: startDate })
            .eq('employee_id', employee.id)
            .in('document_type_id', contractStartTiedDocTypeIds)
            .eq('is_current', 1);
        }
      }
      
      successCount++;
    }

    await logAudit(
      req,
      'Importación de Fechas',
      `Se importaron fechas de vencimiento para ${successCount} empleados`,
      'Documentos', 'bulk', 'Excel', null
    );

    res.json({ 
      success: true, 
      message: `Proceso completado. ${successCount} actualizados, ${errorCount} errores.`,
      errors 
    });

  } catch (error) {
    console.error('Error importing dates:', error);
    res.status(500).json({ error: 'Error al procesar la importación' });
  }
});

// Update employee checklist data
router.patch('/employees/:id/checklist', canModifyData, async (req, res) => {
  const { id } = req.params;
  const { full_name, cedula, contract_type, contract_start, contract_end, carta_ingreso, carnet_verde, carnet_blanco, aviso_css, contrato_sellado } = req.body;
  
  try {
    // 1. Update employee basic info
    const updateData: any = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updateData.full_name = full_name;
    if (cedula !== undefined) updateData.cedula = cedula;
    if (contract_type !== undefined) updateData.contract_type = contract_type;
    if (contract_start !== undefined) updateData.contract_start = contract_start || null;
    if (contract_end !== undefined) updateData.contract_end = contract_end || null;

    const { error: empError } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', id);

    if (empError) throw empError;

    // 2. Update documents if provided
    const docUpdates = [
      { name: 'Carta de ingreso', value: carta_ingreso, isBoolean: true },
      { name: 'Contrato sellado', value: contrato_sellado, isBoolean: true },
      { name: 'Carnet Verde', value: carnet_verde, isBoolean: false },
      { name: 'Carnet Blanco', value: carnet_blanco, isBoolean: false },
      { name: 'Afiliación CSS', value: aviso_css, isBoolean: false }
    ];

    for (const docUpdate of docUpdates) {
      if (docUpdate.value !== undefined) {
        // Find document type ID
        const { data: docTypes } = await supabase
          .from('document_types')
          .select('id')
          .ilike('name', `%${docUpdate.name}%`)
          .limit(1);
          
        const docType = docTypes && docTypes.length > 0 ? docTypes[0] : null;

        // Fallback for Aviso CSS if Afiliación CSS is not found
        let finalDocType = docType;
        if (!finalDocType && docUpdate.name === 'Contrato sellado') {
          // Auto-create the document type if it doesn't exist
          const { data: created } = await supabase
            .from('document_types')
            .upsert([{ id: 'doctype-contrato-sellado', name: 'Contrato sellado', is_active: 1, sort_order: 99 }], { onConflict: 'id' })
            .select('id')
            .single();
          finalDocType = created;
        }
        if (!finalDocType && docUpdate.name === 'Afiliación CSS') {
          const { data: fallbackTypes } = await supabase
            .from('document_types')
            .select('id')
            .ilike('name', `%Aviso de entrada%`)
            .limit(1);
          finalDocType = fallbackTypes && fallbackTypes.length > 0 ? fallbackTypes[0] : null;
        }

        if (finalDocType) {
          // Check if document exists
          const { data: existingDocs } = await supabase
            .from('employee_documents')
            .select('id, is_current')
            .eq('employee_id', id)
            .eq('document_type_id', finalDocType.id)
            .eq('is_current', 1)
            .limit(1);
            
          const existingDoc = existingDocs && existingDocs.length > 0 ? existingDocs[0] : null;

          if (existingDoc) {
            // Update existing document
            const updatePayload: any = {};
            if (docUpdate.isBoolean) {
              if (docUpdate.value === 'NO') {
                await supabase.from('employee_documents').update({ is_current: 0 }).eq('id', existingDoc.id);
              } else if (docUpdate.value === 'SÍ' || docUpdate.value === 'SI') {
                await supabase.from('employee_documents').update({ is_current: 1 }).eq('id', existingDoc.id);
              }
            } else {
              updatePayload.expiry_date = docUpdate.value || null;
              updatePayload.is_current = 1; // Ensure it's active if we're updating its date
              await supabase.from('employee_documents').update(updatePayload).eq('id', existingDoc.id);
            }
          } else if (docUpdate.value && docUpdate.value !== 'NO') {
            // Create new document record
            const { error: insertError } = await supabase.from('employee_documents').insert([{
              id: crypto.randomUUID(),
              employee_id: id,
              document_type_id: finalDocType.id,
              expiry_date: docUpdate.isBoolean ? null : (docUpdate.value || null),
              status: 'vigente',
              is_current: 1,
              file_url: 'manual_entry', // Empty file URL since it's manually added
              file_name: `Agregado manualmente - ${docUpdate.name}`,
              file_size_kb: 0
            }]);
            
            if (insertError) {
              console.error('Error inserting document:', insertError);
            }
          }
        }
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating checklist:', error);
    res.status(500).json({ error: 'Error al actualizar checklist' });
  }
});

// Terminate employee
router.patch('/employees/:id/terminate', canModifyData, async (req, res) => {
  const { termination_reason, termination_date } = req.body;
  const user = (req as any).user;

  try {
    if (user.club_id) {
      const { data: emp } = await supabase.from('employees').select('club_id').eq('id', req.params.id).single();
      if (!emp || emp.club_id !== user.club_id) {
        return res.status(403).json({ error: 'No tiene acceso a empleados de este club' });
      }
    }

    const { data: updatedEmployee, error } = await supabase
      .from('employees')
      .update({ 
        status: 'inactivo', 
        termination_reason, 
        termination_date,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    
    // Log audit
    await logAudit(
      req,
      'Baja de empleado',
      `Empleado dado de baja: ID ${req.params.id}`,
      'Empleado', req.params.id, null, updatedEmployee.club_id
    );

    res.json(updatedEmployee);
  } catch (error) {
    console.error('Error terminating employee:', error);
    res.status(500).json({ error: 'Error al dar de baja al empleado' });
  }
});

// Reactivate employee
router.patch('/employees/:id/reactivate', canModifyData, async (req, res) => {
  const { contract_start } = req.body;
  const user = (req as any).user;

  try {
    if (user.club_id) {
      const { data: emp } = await supabase.from('employees').select('club_id').eq('id', req.params.id).single();
      if (!emp || emp.club_id !== user.club_id) {
        return res.status(403).json({ error: 'No tiene acceso a empleados de este club' });
      }
    }

    const { data: updatedEmployee, error } = await supabase
      .from('employees')
      .update({ 
        status: 'activo', 
        termination_reason: null, 
        termination_date: null,
        contract_start,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    
    // Log audit
    await logAudit(
      req,
      'Reactivación de empleado',
      `Empleado reactivado: ID ${req.params.id}`,
      'Empleado', req.params.id, null, updatedEmployee.club_id
    );

    res.json(updatedEmployee);
  } catch (error) {
    console.error('Error reactivating employee:', error);
    res.status(500).json({ error: 'Error al reactivar al empleado' });
  }
});

// Attendance routes
router.get('/attendance', canViewData, async (req, res) => {
  const { club_id: queryClubId, start_date, end_date } = req.query;
  const user = (req as any).user;

  // If user is Supervisor Interno or Coordinadora, they can only see their club
  const club_id = (user.role === 'Supervisor Interno' || user.role === 'Coordinadora') ? user.club_id : queryClubId;
  
  if (!club_id) {
    return res.status(400).json({ error: 'Se requiere club_id' });
  }

  try {
    // We need to join attendance with employees to filter by club_id
    const { data: attendance, error } = await supabase
      .from('attendance')
      .select(`
        *,
        employees!inner(full_name, club_id)
      `)
      .eq('employees.club_id', club_id)
      .gte('date', start_date)
      .lte('date', end_date);
      
    if (error) throw error;
    
    // Flatten the result to match the expected format
    const formattedAttendance = attendance.map(a => ({
      ...a,
      full_name: (a.employees as any).full_name
    }));
    
    res.json(formattedAttendance);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
});

// Sync attendance from a programación schedule (called by Power Automate)
// Auth: X-Api-Key header (env: PA_API_KEY)
// Body: { clubId, records: [{ name, date, mark }] }
// Marks: A=presente, L/P=permiso, I=incapacidad  — X/D/blank are skipped (no attendance record)
router.post('/attendance/from-schedule', isApiKey, async (req, res) => {
  const { clubId, records } = req.body;

  if (!clubId || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Se requiere clubId y records[]' });
  }

  const MARK_TO_STATUS: Record<string, string> = {
    A: 'presente',
    L: 'permiso',
    P: 'permiso',
    I: 'incapacidad',
  };

  const normalize = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('club_id', clubId)
    .eq('status', 'activo');

  if (empErr) return res.status(500).json({ error: 'Error consultando empleados' });

  const nameMap = new Map((employees || []).map((e: any) => [normalize(e.full_name), e.id]));

  const toInsert: any[] = [];
  const unmatched = new Set<string>();

  for (const r of records) {
    const status = MARK_TO_STATUS[r.mark?.toUpperCase()];
    if (!status) continue; // X, D, blank, P pendiente → sin registro

    const empId = nameMap.get(normalize(r.name));
    if (!empId) { unmatched.add(r.name); continue; }

    toInsert.push({ id: crypto.randomUUID(), employee_id: empId, date: r.date, status, updated_at: new Date().toISOString() });
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('attendance').upsert(toInsert, { onConflict: 'employee_id, date' });
    if (error) return res.status(500).json({ error: 'Error guardando asistencia' });
  }

  res.json({ synced: toInsert.length, unmatched: [...unmatched] });
});

// POST /api/attendance/import-programacion
// Auth: isAuthenticated — Admin, Super Admin, RRHH, Supervisora Redvolution
// Body: multipart/form-data { file, clubId, year, month, half, sheetName, headerRow, nameCol, dataStartRow }
router.post('/attendance/import-programacion', isAuthenticated, (req: any, res: any, next: any) => {
  uploadExcel.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Error al subir archivo: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: any, res: any) => {
  try {
    const allowed = ['Administrador', 'Super Administrador', 'Recursos Humanos', 'Supervisora Redvolution'];
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Sin permiso para importar programaciones' });
    }

    const { clubId, year, month, half, sheetName, headerRow, nameCol, dataStartRow } = req.body;
    const file = req.file;

    if (!clubId || !year || !month || !half || !sheetName || !file) {
      return res.status(400).json({ error: 'Faltan parámetros: clubId, year, month, half, sheetName y archivo son obligatorios' });
    }

    const y = parseInt(year);
    const m = parseInt(month);
    const h = parseInt(half);
    const hRow = parseInt(headerRow) || 4;
    const nCol = parseInt(nameCol) || 2;
    const dsRow = parseInt(dataStartRow) || 5;

    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer);

    const ws = wb.getWorksheet(sheetName);
    if (!ws) return res.status(400).json({ error: `Hoja "${sheetName}" no encontrada en el archivo` });

    const startDay = h === 1 ? 1 : 16;
    const endDay = h === 1 ? 15 : new Date(y, m, 0).getDate();

    const dayColMap: Record<number, number> = {};
    ws.getRow(hRow).eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
      const val = Number(cell.value);
      if (!isNaN(val) && val >= startDay && val <= endDay) dayColMap[val] = colNum;
    });

    const rawRecords: { name: string; date: string; mark: string }[] = [];
    const totalRows = ws.rowCount || dsRow + 200;
    for (let rIdx = dsRow; rIdx <= totalRows; rIdx++) {
      const row = ws.getRow(rIdx);
      const name = String(row.getCell(nCol).value ?? '').trim();
      if (!name) continue;
      for (let day = startDay; day <= endDay; day++) {
        const col = dayColMap[day];
        if (!col) continue;
        const mark = String(row.getCell(col).value ?? '').trim().toUpperCase();
        if (!mark || mark === 'X' || mark === 'D') continue;
        const mm = String(m).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        rawRecords.push({ name, date: `${y}-${mm}-${dd}`, mark });
      }
    }

    const MARK_TO_STATUS: Record<string, string> = { A: 'presente', L: 'permiso', P: 'permiso', I: 'incapacidad' };
    const normalize = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

    const { data: employees, error: empErr } = await supabase
      .from('employees').select('id, full_name').eq('club_id', clubId).eq('status', 'activo');
    if (empErr) return res.status(500).json({ error: 'Error consultando empleados' });

    const nameMap = new Map((employees || []).map((e: any) => [normalize(e.full_name), e.id]));
    const toInsert: any[] = [];
    const unmatched = new Set<string>();

    for (const r of rawRecords) {
      const status = MARK_TO_STATUS[r.mark];
      if (!status) continue;
      const empId = nameMap.get(normalize(r.name));
      if (!empId) { unmatched.add(r.name); continue; }
      toInsert.push({ id: crypto.randomUUID(), employee_id: empId, date: r.date, status, updated_at: new Date().toISOString() });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('attendance').upsert(toInsert, { onConflict: 'employee_id, date' });
      if (error) return res.status(500).json({ error: 'Error guardando asistencia' });
    }

    res.json({ synced: toInsert.length, unmatched: [...unmatched] });
  } catch (err: any) {
    console.error('[import-programacion]', err);
    res.status(500).json({ error: err?.message || 'Error interno al importar programación' });
  }
});

router.post('/attendance', canModifyData, async (req, res) => {
  const { records, club_id, start_date, end_date } = req.body;
  const user = (req as any).user;

  // Supervisor Interno can only update attendance for their own club's employees
  if (user.role === 'Supervisor Interno' && Array.isArray(records)) {
    const employeeIds = records.map((r: any) => r.employee_id);
    const { data: empData } = await supabase
      .from('employees')
      .select('id, club_id')
      .in('id', employeeIds);
    const unauthorized = (empData || []).find((e: any) => e.club_id !== user.club_id);
    if (unauthorized) {
      return res.status(403).json({ error: 'Acceso denegado. Solo puede registrar asistencia de empleados de su club.' });
    }
  }

  try {
    // Get all employee IDs for this club to know the scope to delete
    const effectiveClubId = (user.role === 'Supervisor Interno') ? user.club_id : club_id;

    if (effectiveClubId && start_date && end_date) {
      const { data: clubEmps } = await supabase
        .from('employees')
        .select('id')
        .eq('club_id', effectiveClubId);

      const empIds = (clubEmps || []).map((e: any) => e.id);

      if (empIds.length > 0) {
        // Delete all existing records for these employees in the period
        await supabase
          .from('attendance')
          .delete()
          .in('employee_id', empIds)
          .gte('date', start_date)
          .lte('date', end_date);
      }
    }

    // Insert the current records (if any)
    if (Array.isArray(records) && records.length > 0) {
      const insertData = records.map((record: any) => ({
        id: crypto.randomUUID(),
        employee_id: record.employee_id,
        date: record.date,
        status: record.status,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('attendance')
        .upsert(insertData, { onConflict: 'employee_id, date' });

      if (error) throw error;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Attendance error:', error);
    res.status(500).json({ error: 'Error al guardar asistencia' });
  }
});

// Attendance Requests routes
router.get('/attendance-requests', canViewData, async (req, res) => {
  const { club_id: queryClubId, start_date, end_date } = req.query;
  const user = (req as any).user;

  // If user is Supervisor Interno or Coordinadora, they can only see their club
  const club_id = (user.role === 'Supervisor Interno' || user.role === 'Coordinadora') ? user.club_id : queryClubId;
  
  try {
    const { data: requests, error } = await supabase
      .from('attendance_requests')
      .select('*')
      .eq('club_id', club_id)
      .gte('date', start_date)
      .lte('date', end_date);
      
    if (error) throw error;
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener solicitudes de asistencia' });
  }
});

router.post('/attendance-requests', canModifyData, async (req, res) => {
  const { records } = req.body; // Array of { club_id, date, requested_count }
  const user = (req as any).user;
  
  // Supervisor Interno can only modify their own club
  if (user.role === 'Supervisor Interno') {
    const invalidRecord = records.find((r: any) => r.club_id !== user.club_id);
    if (invalidRecord) {
      return res.status(403).json({ error: 'Acceso denegado. Solo puede modificar su club asignado.' });
    }
  }
  
  try {
    const upsertData = records.map((record: any) => ({
      id: crypto.randomUUID(),
      club_id: record.club_id,
      date: record.date,
      requested_count: record.requested_count,
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('attendance_requests')
      .upsert(upsertData, { onConflict: 'club_id, date' });
      
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Attendance requests error:', error);
    res.status(500).json({ error: 'Error al guardar solicitudes de asistencia' });
  }
});

// Generate PSMT planilla using official PriceSmart template
router.get('/payroll/psmt-planilla', canViewData, async (req, res) => {
  const { clubId, year, month, half } = req.query as Record<string, string>;

  if (!clubId || !year || !month || !['1', '2'].includes(half)) {
    return res.status(400).json({ error: 'Parámetros requeridos: clubId, year, month, half (1 o 2)' });
  }

  try {
    const y = parseInt(year);
    const m = parseInt(month) - 1; // 0-indexed for Date constructor

    const startDate = half === '1' ? new Date(y, m, 1) : new Date(y, m, 16);
    const endDate   = half === '1' ? new Date(y, m, 15) : new Date(y, m + 1, 0);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const clubCfg = await getClubConfig(clubId);
    if (!clubCfg.name) return res.status(404).json({ error: 'Club no encontrado' });
    const club = clubCfg;

    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, full_name, cedula, position, contract_start, banco, cuenta_bancaria')
      .eq('club_id', clubId)
      .eq('status', 'activo')
      .order('full_name');
    if (empErr) throw empErr;

    const empList = employees || [];
    const empIds = empList.map((e: any) => e.id);

    const { data: attendance, error: attErr } = empIds.length
      ? await supabase
          .from('attendance')
          .select('employee_id, date, status')
          .gte('date', fmt(startDate))
          .lte('date', fmt(endDate))
          .in('employee_id', empIds)
      : { data: [], error: null };
    if (attErr) throw attErr;

    const attMap = new Map<string, string>();
    for (const a of attendance || []) {
      attMap.set(`${a.employee_id}:${a.date}`, a.status);
    }

    // Build period days array
    const periodDays: Date[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      periodDays.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const toCode = (status: string | undefined, day: Date): string => {
      if (!status) return '';
      const isSunday = day.getDay() === 0;
      switch (status) {
        case 'presente': case 'capacitacion': case 'apoyo':
          return isSunday ? 'D' : '1';
        case 'incapacidad': return 'I';
        case 'permiso':     return 'P';
        case 'feriado':     return 'F';
        default:            return '';
      }
    };

    const SALARIO_MENSUAL = clubCfg.salary_mensual;
    const SALARIO_DIA     = clubCfg.salary_dia;
    const SALARIO_DOM     = clubCfg.salary_dom;
    const CSS_RATE        = clubCfg.css_rate;

    const { default: ExcelJS } = await import('exceljs');
    const templateFile = half === '1' ? 'psmt-1ra-q.xlsx' : 'psmt-2da-q.xlsx';
    const templatePath = path.join(process.cwd(), 'server', 'templates', templateFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    const ws = wb.getWorksheet(clubCfg.sheet_name);
    if (!ws) throw new Error(`Sheet "${clubCfg.sheet_name}" no encontrada en plantilla`);

    const MONTHS_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const monthNameEs = MONTHS_ES[m];
    const periodoShort = half === '1' ? '1RA Q' : '2DA Q';
    ws.getRow(3).getCell(8).value = monthNameEs;
    ws.getRow(3).commit();
    ws.getRow(4).getCell(7).value = `PERIODO: ${periodoShort} ${monthNameEs} ${y}`;
    ws.getRow(4).getCell(8).value = periodoShort;
    ws.getRow(4).commit();
    try { (ws as any).conditionalFormattings.splice(0, (ws as any).conditionalFormattings.length); } catch {}

    const DATA_START_ROW = 9;
    const COL_N = 14; // column N = 14 (1-indexed)
    const MAX_DAY_COLS = 15;

    // Extract formulas from row 9 to extend to all employee rows
    const rowFormulas = new Map<number, string>();
    ws.getRow(DATA_START_ROW).eachCell({ includeEmpty: false }, (cell, col) => {
      if ((cell as any).formula) rowFormulas.set(col, (cell as any).formula as string);
    });
    const adjustFormula = (f: string, toRow: number): string =>
      f.replace(/([A-Z]+)(\d+)/g, (_, c, n) => parseInt(n) === DATA_START_ROW ? c + toRow : c + n);

    // Fill employee rows
    for (let i = 0; i < empList.length; i++) {
      const emp = empList[i] as any;
      const rowIdx = DATA_START_ROW + i;
      const row = ws.getRow(rowIdx);
      const kronos = emp.cedula ? clubCfg.kronos_prefix + emp.cedula.replace(/-/g, '') : '';

      // Clear static fills from template's sample data rows
      for (let c = 1; c <= COL_N + MAX_DAY_COLS - 1; c++) {
        try {
          const cell = row.getCell(c);
          if (!(cell as any).formula) cell.fill = { type: 'pattern', pattern: 'none' };
        } catch {}
      }

      row.getCell(1).value  = i + 1;
      row.getCell(2).value  = clubCfg.country.toUpperCase();
      row.getCell(3).value  = emp.banco || '';
      row.getCell(4).value  = emp.cuenta_bancaria || '';
      row.getCell(5).value  = emp.cedula || '';
      row.getCell(6).value  = kronos;
      row.getCell(7).value  = emp.full_name;
      row.getCell(8).value  = 'PSMT ' + (club.name as string).toUpperCase();
      row.getCell(9).value  = 'Club ' + club.name;
      row.getCell(10).value = emp.position || clubCfg.default_position;
      row.getCell(11).value = emp.contract_start || '';
      row.getCell(12).value = SALARIO_MENSUAL;
      row.getCell(13).value = SALARIO_DIA;

      for (let d = 0; d < periodDays.length && d < MAX_DAY_COLS; d++) {
        const day = periodDays[d];
        const dateStr = fmt(day);
        const code = toCode(attMap.get(`${emp.id}:${dateStr}`), day);
        row.getCell(COL_N + d).value = code || null;
      }

      // Clear template's hardcoded deduction inputs (AX=50, AY=51, AZ=52)
      row.getCell(50).value = null;
      row.getCell(51).value = null;
      row.getCell(52).value = null;

      // Write row-adjusted formulas to every employee row (fixes rows beyond template sample range)
      for (const [col, formula] of rowFormulas.entries()) {
        try { row.getCell(col).value = { formula: adjustFormula(formula, rowIdx) }; } catch {}
      }
      row.commit();
    }

    // Clear data cells in unused rows (so sample data from template doesn't bleed through)
    const maxTemplateRow = half === '1' ? 84 : 92;
    for (let rowIdx = DATA_START_ROW + empList.length; rowIdx <= maxTemplateRow; rowIdx++) {
      const row = ws.getRow(rowIdx);
      for (let c = 1; c <= 52; c++) { // up to AZ (col 52) to catch deduction input cols
        try {
          const cell = row.getCell(c);
          if (!(cell as any).formula) {
            cell.value = null;
            cell.fill = { type: 'pattern', pattern: 'none' };
          }
        } catch {}
      }
      row.commit();
    }

    // Fill Hoja2 with bank transfer data
    const ws2 = wb.getWorksheet('Hoja2');
    if (ws2) {
      const HOJA2_START = 5;
      const HOJA2_MAX   = 79;
      for (let i = 0; i < empList.length; i++) {
        const emp = empList[i] as any;
        const rowIdx = HOJA2_START + i;
        let dias = 0, doms = 0, incap = 0, fer = 0;
        for (const day of periodDays) {
          const code = toCode(attMap.get(`${emp.id}:${fmt(day)}`), day);
          if (code === '1') dias++;
          else if (code === 'D') doms++;
          else if (code === 'I') incap++;
          else if (code === 'F') fer++;
        }
        const bruto = parseFloat((dias * SALARIO_DIA + doms * SALARIO_DOM + incap * SALARIO_DIA + fer * SALARIO_DIA).toFixed(2));
        const desc  = parseFloat((bruto * CSS_RATE).toFixed(2));
        const neto  = parseFloat((bruto - desc).toFixed(2));

        const row2 = ws2.getRow(rowIdx);
        row2.getCell(2).value = emp.banco || '';
        row2.getCell(3).value = emp.cuenta_bancaria || '';
        row2.getCell(4).value = emp.full_name;
        row2.getCell(5).value = neto;
        row2.commit();
      }
      // Clear unused Hoja2 rows
      for (let rowIdx = HOJA2_START + empList.length; rowIdx <= HOJA2_MAX; rowIdx++) {
        const row2 = ws2.getRow(rowIdx);
        for (let c = 2; c <= 5; c++) row2.getCell(c).value = null;
        row2.commit();
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="planilla-psmt.xlsx"');
    await wb.xlsx.write(res);
    res.end();

  } catch (error: any) {
    console.error('Error generando planilla PSMT:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar la planilla PSMT' });
    }
  }
});

// Generate PSMT planilla from programación Excel — supports 1 or multiple clubs
// Auth: isAuthenticated + role check
// Body: multipart/form-data { files[], entries (JSON), year, month, half }
// entries JSON: [{clubId?, sheetName, headerRow, nameCol, dataStartRow}, ...]
router.post('/payroll/psmt-from-programacion', isAuthenticated, (req: any, res: any, next: any) => {
  uploadExcel.array('files', 10)(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Error al subir: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: any, res: any) => {
  try {
    const allowed = ['Administrador', 'Super Administrador', 'Recursos Humanos', 'Supervisora Redvolution'];
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Sin permiso para generar planilla PSMT' });
    }

    const files = (req.files || []) as Express.Multer.File[];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un archivo de programación (.xlsx)' });
    }

    let entries: Array<{ clubId?: string; sheetName: string; headerRow: number; nameCol: number; dataStartRow: number }>;
    try {
      entries = JSON.parse(req.body.entries || '[]');
    } catch {
      return res.status(400).json({ error: 'Parámetro entries inválido' });
    }
    if (entries.length === 0 || entries.length !== files.length) {
      return res.status(400).json({ error: 'Número de archivos y configuraciones no coincide' });
    }

    const { year, month, half } = req.body;
    if (!year || !month || !['1', '2'].includes(half)) {
      return res.status(400).json({ error: 'Parámetros requeridos: year, month, half (1 o 2)' });
    }

    const y = parseInt(year);
    const m = parseInt(month) - 1;

    const startDay = half === '1' ? 1 : 16;
    const endDay   = half === '1' ? 15 : new Date(y, m + 1, 0).getDate();

    const normalize = (s: string) =>
      s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

    // ── 1. Parse all programación files → build combined progAttMap ──
    const { default: XLSX } = (await import('xlsx')) as any;
    const progAttMap = new Map<string, Map<string, string>>();

    for (let i = 0; i < files.length; i++) {
      const file  = files[i];
      const entry = entries[i];
      const hRow  = entry.headerRow    || 4;
      const nCol  = entry.nameCol      || 2;
      const dsRow = entry.dataStartRow || 5;
      const sName = entry.sheetName    || '';

      const progWb = XLSX.read(file.buffer, { type: 'buffer' });
      const sNames: string[] = progWb.SheetNames || [];
      let progWs = progWb.Sheets[sName];
      if (!progWs) {
        const nt = sName.trim().toUpperCase();
        const match = sNames.find((s: string) => s.trim().toUpperCase() === nt);
        if (match) progWs = progWb.Sheets[match];
      }
      if (!progWs) {
        return res.status(400).json({
          error: `Archivo ${i + 1}: hoja "${sName}" no encontrada. Disponibles: ${sNames.join(' | ')}`
        });
      }

      const range = XLSX.utils.decode_range(progWs['!ref'] || 'A1:A1');
      const dayColMap: Record<number, number> = {};
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = progWs[XLSX.utils.encode_cell({ r: hRow - 1, c: C })];
        if (!cell) continue;
        const val = Number(cell.v);
        if (!isNaN(val) && val >= startDay && val <= endDay) dayColMap[val] = C;
      }
      for (let R = dsRow - 1; R <= range.e.r; R++) {
        const nameCell = progWs[XLSX.utils.encode_cell({ r: R, c: nCol - 1 })];
        const rawName  = String(nameCell?.v ?? '').trim();
        if (!rawName) continue;
        const normName = normalize(rawName);
        if (!progAttMap.has(normName)) progAttMap.set(normName, new Map());
        const empMarks = progAttMap.get(normName)!;
        for (let day = startDay; day <= endDay; day++) {
          const col = dayColMap[day];
          if (col === undefined) continue;
          const markCell = progWs[XLSX.utils.encode_cell({ r: R, c: col })];
          const mark = String(markCell?.v ?? '').trim().toUpperCase();
          if (!mark) continue;
          const mm = String(m + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          empMarks.set(`${y}-${mm}-${dd}`, mark);
        }
      }
    }

    const matchedProgKeys = new Set<string>();
    const LEGEND_KEYS = ['ASIGNADA', 'POR ASIGNAR', 'PARA CAPACITACION', 'PERMISO SOLICITADO',
      'INCAPACIDAD', 'AUSENCIA', 'LIMPIEZA', 'REEMPLAZO', 'TRASLADO',
      'BACKUP', 'VACACIONES', 'DESCANSO', 'IN HOUSE', 'SOLICITUD'];

    const levenshtein = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
      for (let i = 1; i <= m; i++) {
        let prev = i;
        for (let j = 1; j <= n; j++) {
          const cur = a[i - 1] === b[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j], prev, dp[j - 1]);
          dp[j - 1] = prev;
          prev = cur;
        }
        dp[n] = prev;
      }
      return dp[n];
    };

    const findProgMarks = (empFullName: string): Map<string, string> | undefined => {
      const normEmp = normalize(empFullName);
      // 1. Exact match
      const exact = progAttMap.get(normEmp);
      if (exact) { matchedProgKeys.add(normEmp); return exact; }
      // 2. Prefix / suffix match (handles compound surnames)
      for (const [progName, marks] of progAttMap) {
        if (progName.startsWith(normEmp + ' ') || normEmp.startsWith(progName + ' ')) {
          matchedProgKeys.add(progName);
          return marks;
        }
      }
      // 3. Fuzzy match: Levenshtein distance <= 2, must be the unique closest candidate
      const FUZZY_MAX = 2;
      let bestKey: string | null = null;
      let bestDist = FUZZY_MAX + 1;
      let ambiguous = false;
      for (const progName of progAttMap.keys()) {
        const dist = levenshtein(normEmp, progName);
        if (dist <= FUZZY_MAX) {
          if (dist < bestDist) { bestDist = dist; bestKey = progName; ambiguous = false; }
          else if (dist === bestDist) { ambiguous = true; }
        }
      }
      if (bestKey && !ambiguous) { matchedProgKeys.add(bestKey); return progAttMap.get(bestKey); }
      return undefined;
    };

    const addSinMatchSheet = (workbook: any, unmatchedDB: Array<{ club: string; name: string }>) => {
      const unmatchedExcel = [...progAttMap.keys()].filter(k =>
        !matchedProgKeys.has(k) && !LEGEND_KEYS.some(lk => k.includes(normalize(lk)))
      );
      if (unmatchedDB.length === 0 && unmatchedExcel.length === 0) return;
      const wsm = workbook.addWorksheet('SIN MATCH');
      const hdr = wsm.addRow(['TIPO', 'CLUB', 'NOMBRE EN SISTEMA', 'DETALLE']);
      hdr.font = { bold: true };
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } };
      unmatchedDB.forEach((u: any) => wsm.addRow([
        'DB sin match en Excel', u.club, u.name, 'No se encontro en la programacion — revisar ortografia del nombre'
      ]));
      if (unmatchedDB.length > 0 && unmatchedExcel.length > 0) wsm.addRow([]);
      unmatchedExcel.forEach((n: string) => wsm.addRow([
        'Excel sin registro en DB', '', n, 'Empleada no registrada en el sistema'
      ]));
      wsm.columns = [{ width: 28 }, { width: 18 }, { width: 32 }, { width: 56 }];
    };

    // Single-club: 1 entry with clubId. Multi-club: everything else.
    const clubId = (entries.length === 1 && entries[0].clubId) ? entries[0].clubId : undefined;
    // For multi-file uploads: restrict to only the uploaded clubs (in DB sort order)
    const specificClubIds = entries.length > 1
      ? entries.map(e => e.clubId).filter(Boolean) as string[]
      : null;

    // ── 2. Build common period utilities ──
    const startDate = half === '1' ? new Date(y, m, 1) : new Date(y, m, 16);
    const endDate   = half === '1' ? new Date(y, m, 15) : new Date(y, m + 1, 0);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const periodDays: Date[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) { periodDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

    const progToCode = (mark: string | undefined, day: Date): string => {
      if (!mark) return '';
      const isSunday = day.getDay() === 0;
      switch (mark) {
        case 'A': return isSunday ? 'D' : '1';
        case 'P': return 'P';
        case 'I': return 'I';
        case 'F': return 'F';
        default:  return '';
      }
    };

    const MONTHS_ES    = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const monthNameEs  = MONTHS_ES[m];
    const periodoShort = half === '1' ? '1RA Q' : '2DA Q';

    if (clubId) {
    // ── SINGLE-CLUB MODE ──
    const clubCfg = await getClubConfig(clubId);
    if (!clubCfg.name) return res.status(404).json({ error: 'Club no encontrado' });

    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, full_name, cedula, position, contract_start, banco, cuenta_bancaria')
      .eq('club_id', clubId)
      .eq('status', 'activo')
      .order('full_name');
    if (empErr) throw empErr;

    const empList = employees || [];
    const SALARIO_MENSUAL = clubCfg.salary_mensual;
    const SALARIO_DIA     = clubCfg.salary_dia;
    const SALARIO_DOM     = clubCfg.salary_dom;
    const CSS_RATE        = clubCfg.css_rate;

    // ── Load PSMT template and fill with ExcelJS ──
    const { default: ExcelJS } = await import('exceljs');
    const templateFile = half === '1' ? 'psmt-1ra-q.xlsx' : 'psmt-2da-q.xlsx';
    const templatePath = path.join(process.cwd(), 'server', 'templates', templateFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    const ws = wb.getWorksheet(clubCfg.sheet_name);
    if (!ws) throw new Error(`Sheet "${clubCfg.sheet_name}" no encontrada en plantilla PSMT`);

    ws.getRow(3).getCell(8).value = monthNameEs;
    ws.getRow(3).commit();
    ws.getRow(4).getCell(7).value = `PERIODO: ${periodoShort} ${monthNameEs} ${y}`;
    ws.getRow(4).getCell(8).value = periodoShort;
    ws.getRow(4).commit();
    try { (ws as any).conditionalFormattings.splice(0, (ws as any).conditionalFormattings.length); } catch {}

    const nullValObj = {
      get type() { return 0; }, get formula() { return ''; },
      get value() { return null; }, get model() { return { type: 0 }; },
      release() {}, acquire() {}
    };
    for (const row of ((ws as any)._rows || [])) {
      if (!row) continue;
      for (const cell of ((row as any)._cells || [])) {
        if (!cell) continue;
        const v = (cell as any)._value;
        if (v && v.model?.type === 6 && v.model?.formula == null) {
          try {
            const resolved = String(v.formula ?? '');
            if (resolved) {
              (v.model as any).formula = resolved;
              delete (v.model as any).sharedFormula;
            } else {
              (cell as any)._value = nullValObj;
            }
          } catch {
            (cell as any)._value = nullValObj;
          }
        }
      }
    }

    const DATA_START_ROW = 9;
    const COL_N          = 14;
    const numDays        = periodDays.length;
    const HEADER_ROW     = 8;
    const calcColMap: Record<string, number> = {};
    const labelMap: Array<[string, string]> = [
      ['TOTAL DOMINGOS',     'totalDoms'],
      ['TOTAL INCAPACIDAD',  'totalIncap'],
      ['TOTAL PERMISO',      'totalPermiso'],
      ['TOTAL FERIADO',      'totalFeriado'],
      ['DIAS LABORADOS',     'dias'],
      ['DOMINGOS LABORADOS', 'doms'],
      ['INCAPACIDAD',        'incap'],
      ['PERMISO',            'permiso'],
      ['FERIADO',            'feriado'],
      ['BRUTO',              'bruto'],
      ['CSS',                'css'],
      ['NETO',               'neto'],
    ];
    const stripAccents = (s: string) =>
      s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    ws.getRow(HEADER_ROW).eachCell({ includeEmpty: false }, (cell, col) => {
      const text = stripAccents(String(cell.value ?? ''));
      for (const [label, key] of labelMap) {
        if (text.includes(label) && !calcColMap[key]) { calcColMap[key] = col; break; }
      }
    });

    const firstCalcCol = Math.min(
      ...[calcColMap.dias, calcColMap.doms, calcColMap.totalDoms].filter(Boolean as any)
    );
    const maxDaySlots = (firstCalcCol && isFinite(firstCalcCol)) ? firstCalcCol - COL_N : 15;

    const unmatchedDB: Array<{ club: string; name: string }> = [];
    for (let i = 0; i < empList.length; i++) {
      const emp      = empList[i] as any;
      const rowIdx   = DATA_START_ROW + i;
      const row      = ws.getRow(rowIdx);
      const kronos   = emp.cedula ? clubCfg.kronos_prefix + emp.cedula.replace(/-/g, '') : '';
      const empMarks = findProgMarks(emp.full_name);
      if (!empMarks) unmatchedDB.push({ club: clubCfg.name as string, name: emp.full_name });

      let dias = 0, doms = 0, incap = 0, permiso = 0, fer = 0;
      for (const day of periodDays) {
        const code = progToCode(empMarks?.get(fmt(day)), day);
        if      (code === '1') dias++;
        else if (code === 'D') doms++;
        else if (code === 'I') incap++;
        else if (code === 'P') permiso++;
        else if (code === 'F') fer++;
      }
      const bruto = parseFloat((dias * SALARIO_DIA + doms * SALARIO_DOM + incap * SALARIO_DIA + fer * SALARIO_DIA + permiso * SALARIO_DIA).toFixed(2));
      const css   = parseFloat((bruto * CSS_RATE).toFixed(2));
      const neto  = parseFloat((bruto - css).toFixed(2));

      const clearUpTo = Math.max(COL_N + numDays - 1, 52);
      for (let c = 1; c <= clearUpTo; c++) {
        try {
          const cell = row.getCell(c);
          if (!(cell as any).formula) cell.fill = { type: 'pattern', pattern: 'none' };
        } catch {}
      }

      row.getCell(1).value  = i + 1;
      row.getCell(2).value  = clubCfg.country.toUpperCase();
      row.getCell(3).value  = emp.banco || '';
      row.getCell(4).value  = emp.cuenta_bancaria || '';
      row.getCell(5).value  = emp.cedula || '';
      row.getCell(6).value  = kronos;
      row.getCell(7).value  = emp.full_name;
      row.getCell(8).value  = 'PSMT ' + (clubCfg.name as string).toUpperCase();
      row.getCell(9).value  = 'Club ' + clubCfg.name;
      row.getCell(10).value = emp.position || clubCfg.default_position;
      row.getCell(11).value = emp.contract_start || '';
      row.getCell(12).value = SALARIO_MENSUAL;
      row.getCell(13).value = SALARIO_DIA;

      for (let d = 0; d < Math.min(numDays, maxDaySlots); d++) {
        const day  = periodDays[d];
        const mark = empMarks?.get(fmt(day));
        try { row.getCell(COL_N + d).value = progToCode(mark, day) || null; } catch {}
      }

      const safeWrite = (col: number | undefined, val: any) => {
        if (!col) return;
        try { row.getCell(col).value = val; } catch {}
      };
      safeWrite(calcColMap.dias,         dias    || null);
      safeWrite(calcColMap.doms,         doms    || null);
      safeWrite(calcColMap.totalDoms,    doms    ? parseFloat((doms * SALARIO_DOM).toFixed(2)) : null);
      safeWrite(calcColMap.incap,        incap   || null);
      safeWrite(calcColMap.totalIncap,   incap   ? parseFloat((incap * SALARIO_DIA).toFixed(2)) : null);
      safeWrite(calcColMap.permiso,      permiso || null);
      safeWrite(calcColMap.totalPermiso, permiso ? parseFloat((permiso * SALARIO_DIA).toFixed(2)) : null);
      safeWrite(calcColMap.feriado,      fer     || null);
      safeWrite(calcColMap.totalFeriado, fer     ? parseFloat((fer * SALARIO_DIA).toFixed(2)) : null);
      safeWrite(calcColMap.bruto,        bruto   || null);
      safeWrite(calcColMap.css,          css     || null);
      safeWrite(calcColMap.neto,         neto    || null);

      row.getCell(50).value = null;
      row.getCell(51).value = null;
      row.getCell(52).value = null;

      row.commit();
    }

    const maxTemplateRow = half === '1' ? 84 : 92;
    for (let rowIdx = DATA_START_ROW + empList.length; rowIdx <= maxTemplateRow; rowIdx++) {
      const row = ws.getRow(rowIdx);
      for (let c = 1; c <= 52; c++) {
        try {
          const cell = row.getCell(c);
          if (!(cell as any).formula) { cell.value = null; cell.fill = { type: 'pattern', pattern: 'none' }; }
        } catch {}
      }
      row.commit();
    }

    const ws2 = wb.getWorksheet('Hoja2');
    if (ws2) {
      const HOJA2_START = 5;
      const HOJA2_MAX   = 79;
      for (let i = 0; i < empList.length; i++) {
        const emp      = empList[i] as any;
        const rowIdx   = HOJA2_START + i;
        const empMarks = findProgMarks(emp.full_name);
        let dias = 0, doms = 0, incap = 0, fer = 0;
        for (const day of periodDays) {
          const code = progToCode(empMarks?.get(fmt(day)), day);
          if (code === '1') dias++;
          else if (code === 'D') doms++;
          else if (code === 'I') incap++;
          else if (code === 'F') fer++;
        }
        const bruto = parseFloat((dias * SALARIO_DIA + doms * SALARIO_DOM + incap * SALARIO_DIA + fer * SALARIO_DIA).toFixed(2));
        const desc  = parseFloat((bruto * CSS_RATE).toFixed(2));
        const neto  = parseFloat((bruto - desc).toFixed(2));

        const row2 = ws2.getRow(rowIdx);
        row2.getCell(2).value = emp.banco || '';
        row2.getCell(3).value = emp.cuenta_bancaria || '';
        row2.getCell(4).value = emp.full_name;
        row2.getCell(5).value = neto;
        row2.commit();
      }
      for (let rowIdx = HOJA2_START + empList.length; rowIdx <= HOJA2_MAX; rowIdx++) {
        const row2 = ws2.getRow(rowIdx);
        for (let c = 2; c <= 5; c++) row2.getCell(c).value = null;
        row2.commit();
      }
    }

    addSinMatchSheet(wb, unmatchedDB);
    const clubNameSafe = (clubCfg.name as string).replace(/\s+/g, '_').toUpperCase();
    const filename = `PSMT_${clubNameSafe}_${periodoShort.replace(/ /g, '_')}_${monthNameEs}_${y}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();

    } else {
    // ── MULTI-CLUB MODE ──
    let clubs: any[];
    if (specificClubIds && specificClubIds.length > 0) {
      const { data: scData, error: scErr } = await supabase
        .from('clubs').select('id, name, sort_order')
        .in('id', specificClubIds).order('sort_order', { ascending: true });
      if (scErr) throw scErr;
      clubs = scData || [];
    } else {
      const { data: acData, error: acErr } = await supabase
        .from('clubs').select('id, name, sort_order')
        .eq('is_active', 1).not('id', 'in', '("global","hr")')
        .order('sort_order', { ascending: true });
      if (acErr) throw acErr;
      clubs = acData || [];
    }
    if (clubs.length === 0) return res.status(404).json({ error: 'No hay clubes activos' });

    const clubConfigs = await Promise.all(clubs.map((c: any) => getClubConfig(c.id)));
    const firstCfg = clubConfigs[0];

    const { default: ExcelJS2 } = await import('exceljs');
    const templateFile2 = half === '1' ? 'psmt-1ra-q.xlsx' : 'psmt-2da-q.xlsx';
    const templatePath2 = path.join(process.cwd(), 'server', 'templates', templateFile2);
    const wb2 = new ExcelJS2.Workbook();
    await wb2.xlsx.readFile(templatePath2);

    const ws2m = wb2.getWorksheet(firstCfg?.sheet_name ?? 'PRICESMART ');
    if (!ws2m) throw new Error(`Sheet "${firstCfg?.sheet_name}" no encontrada en plantilla PSMT`);

    ws2m.getRow(3).getCell(8).value = monthNameEs; ws2m.getRow(3).commit();
    ws2m.getRow(4).getCell(7).value = `PERIODO: ${periodoShort} ${monthNameEs} ${y}`;
    ws2m.getRow(4).getCell(8).value = periodoShort; ws2m.getRow(4).commit();
    try { (ws2m as any).conditionalFormattings.splice(0, (ws2m as any).conditionalFormattings.length); } catch {}

    const nullValObj2 = {
      get type() { return 0; }, get formula() { return ''; },
      get value() { return null; }, get model() { return { type: 0 }; },
      release() {}, acquire() {}
    };
    for (const row of ((ws2m as any)._rows || [])) {
      if (!row) continue;
      for (const cell of ((row as any)._cells || [])) {
        if (!cell) continue;
        const v = (cell as any)._value;
        if (v && v.model?.type === 6 && v.model?.formula == null) {
          try {
            const resolved = String(v.formula ?? '');
            if (resolved) { (v.model as any).formula = resolved; delete (v.model as any).sharedFormula; }
            else { (cell as any)._value = nullValObj2; }
          } catch { (cell as any)._value = nullValObj2; }
        }
      }
    }

    const DATA_START_ROW2 = 9;
    const COL_N2          = 14;
    const numDays2        = periodDays.length;
    const HEADER_ROW2     = 8;
    const calcColMap2: Record<string, number> = {};
    const labelMap2: Array<[string, string]> = [
      ['TOTAL DOMINGOS',     'totalDoms'],
      ['TOTAL INCAPACIDAD',  'totalIncap'],
      ['TOTAL PERMISO',      'totalPermiso'],
      ['TOTAL FERIADO',      'totalFeriado'],
      ['DIAS LABORADOS',     'dias'],
      ['DOMINGOS LABORADOS', 'doms'],
      ['INCAPACIDAD',        'incap'],
      ['PERMISO',            'permiso'],
      ['FERIADO',            'feriado'],
      ['BRUTO',              'bruto'],
      ['CSS',                'css'],
      ['NETO',               'neto'],
    ];
    const stripAccents2 = (s: string) =>
      s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    ws2m.getRow(HEADER_ROW2).eachCell({ includeEmpty: false }, (cell: any, col: number) => {
      const text = stripAccents2(String(cell.value ?? ''));
      for (const [label, key] of labelMap2) {
        if (text.includes(label) && !calcColMap2[key]) { calcColMap2[key] = col; break; }
      }
    });
    const firstCalcCol2 = Math.min(
      ...[calcColMap2.dias, calcColMap2.doms, calcColMap2.totalDoms].filter(Boolean as any)
    );
    const maxDaySlots2 = (firstCalcCol2 && isFinite(firstCalcCol2)) ? firstCalcCol2 - COL_N2 : 15;

    let rowOffset = 0;
    const hoja2Rows: Array<{ emp: any; neto: number }> = [];
    const unmatchedDB2: Array<{ club: string; name: string }> = [];

    for (let ci = 0; ci < clubs.length; ci++) {
      const club = clubs[ci] as any;
      const cfg  = clubConfigs[ci];
      const { data: empData, error: empErr2 } = await supabase
        .from('employees')
        .select('id, full_name, cedula, position, contract_start, banco, cuenta_bancaria')
        .eq('club_id', club.id).eq('status', 'activo').order('full_name');
      if (empErr2) throw empErr2;
      const empList2 = empData || [];

      for (let i = 0; i < empList2.length; i++) {
        const emp      = empList2[i] as any;
        const seqNo    = rowOffset + i + 1;
        const row      = ws2m.getRow(DATA_START_ROW2 + rowOffset + i);
        const kronos   = emp.cedula ? cfg.kronos_prefix + emp.cedula.replace(/-/g, '') : '';
        const empMarks = findProgMarks(emp.full_name);
        if (!empMarks) unmatchedDB2.push({ club: cfg.name as string, name: emp.full_name });

        let dias = 0, doms = 0, incap = 0, permiso = 0, fer = 0;
        for (const day of periodDays) {
          const code = progToCode(empMarks?.get(fmt(day)), day);
          if      (code === '1') dias++;
          else if (code === 'D') doms++;
          else if (code === 'I') incap++;
          else if (code === 'P') permiso++;
          else if (code === 'F') fer++;
        }
        const bruto = parseFloat((dias * cfg.salary_dia + doms * cfg.salary_dom + incap * cfg.salary_dia + fer * cfg.salary_dia + permiso * cfg.salary_dia).toFixed(2));
        const css   = parseFloat((bruto * cfg.css_rate).toFixed(2));
        const neto  = parseFloat((bruto - css).toFixed(2));

        const clearUpTo2 = Math.max(COL_N2 + numDays2 - 1, 52);
        for (let c = 1; c <= clearUpTo2; c++) {
          try { const cell = row.getCell(c); if (!(cell as any).formula) cell.fill = { type: 'pattern', pattern: 'none' }; } catch {}
        }
        row.getCell(1).value  = seqNo;
        row.getCell(2).value  = cfg.country.toUpperCase();
        row.getCell(3).value  = emp.banco || '';
        row.getCell(4).value  = emp.cuenta_bancaria || '';
        row.getCell(5).value  = emp.cedula || '';
        row.getCell(6).value  = kronos;
        row.getCell(7).value  = emp.full_name;
        row.getCell(8).value  = 'PSMT ' + (cfg.name as string).toUpperCase();
        row.getCell(9).value  = 'Club ' + cfg.name;
        row.getCell(10).value = emp.position || cfg.default_position;
        row.getCell(11).value = emp.contract_start || '';
        row.getCell(12).value = cfg.salary_mensual;
        row.getCell(13).value = cfg.salary_dia;
        for (let d = 0; d < Math.min(numDays2, maxDaySlots2); d++) {
          try { row.getCell(COL_N2 + d).value = progToCode(empMarks?.get(fmt(periodDays[d])), periodDays[d]) || null; } catch {}
        }
        const safeWrite2 = (col: number | undefined, val: any) => { if (!col) return; try { row.getCell(col).value = val; } catch {} };
        safeWrite2(calcColMap2.dias,         dias    || null);
        safeWrite2(calcColMap2.doms,         doms    || null);
        safeWrite2(calcColMap2.totalDoms,    doms    ? parseFloat((doms * cfg.salary_dom).toFixed(2)) : null);
        safeWrite2(calcColMap2.incap,        incap   || null);
        safeWrite2(calcColMap2.totalIncap,   incap   ? parseFloat((incap * cfg.salary_dia).toFixed(2)) : null);
        safeWrite2(calcColMap2.permiso,      permiso || null);
        safeWrite2(calcColMap2.totalPermiso, permiso ? parseFloat((permiso * cfg.salary_dia).toFixed(2)) : null);
        safeWrite2(calcColMap2.feriado,      fer     || null);
        safeWrite2(calcColMap2.totalFeriado, fer     ? parseFloat((fer * cfg.salary_dia).toFixed(2)) : null);
        safeWrite2(calcColMap2.bruto,        bruto   || null);
        safeWrite2(calcColMap2.css,          css     || null);
        safeWrite2(calcColMap2.neto,         neto    || null);
        row.getCell(50).value = null;
        row.getCell(51).value = null;
        row.getCell(52).value = null;
        row.commit();
        hoja2Rows.push({ emp, neto });
      }
      rowOffset += empList2.length;
    }

    const maxTemplateRow2 = half === '1' ? 84 : 92;
    for (let rowIdx = DATA_START_ROW2 + rowOffset; rowIdx <= maxTemplateRow2; rowIdx++) {
      const row = ws2m.getRow(rowIdx);
      for (let c = 1; c <= 52; c++) {
        try { const cell = row.getCell(c); if (!(cell as any).formula) { cell.value = null; cell.fill = { type: 'pattern', pattern: 'none' }; } } catch {}
      }
      row.commit();
    }

    const ws2h = wb2.getWorksheet('Hoja2');
    if (ws2h) {
      const HOJA2_START2 = 5, HOJA2_MAX2 = 79;
      for (let i = 0; i < hoja2Rows.length && i < (HOJA2_MAX2 - HOJA2_START2 + 1); i++) {
        const { emp, neto } = hoja2Rows[i];
        const row2 = ws2h.getRow(HOJA2_START2 + i);
        row2.getCell(2).value = emp.banco || '';
        row2.getCell(3).value = emp.cuenta_bancaria || '';
        row2.getCell(4).value = emp.full_name;
        row2.getCell(5).value = neto;
        row2.commit();
      }
      for (let rowIdx = HOJA2_START2 + hoja2Rows.length; rowIdx <= HOJA2_MAX2; rowIdx++) {
        const row2 = ws2h.getRow(rowIdx);
        for (let c = 2; c <= 5; c++) row2.getCell(c).value = null;
        row2.commit();
      }
    }

    addSinMatchSheet(wb2, unmatchedDB2);
    const filename2 = `PSMT_GLOBAL_PROG_${periodoShort.replace(/ /g, '_')}_${monthNameEs}_${y}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename2}"`);
    await wb2.xlsx.write(res);
    res.end();
    }

  } catch (error: any) {
    console.error('Error generando PSMT desde programación:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Error al generar la planilla PSMT' });
    }
  }
});

// Generate PSMT planilla for ALL clubs: David → Costa Verde → Metropark (admin only)
router.get('/payroll/psmt-planilla-global', isAdmin, async (req, res) => {
  const { year, month, half } = req.query as Record<string, string>;
  if (!year || !month || !['1', '2'].includes(half)) {
    return res.status(400).json({ error: 'Parámetros requeridos: year, month, half (1 o 2)' });
  }

  try {
    const y = parseInt(year);
    const m = parseInt(month) - 1;

    const startDate = half === '1' ? new Date(y, m, 1) : new Date(y, m, 16);
    const endDate   = half === '1' ? new Date(y, m, 15) : new Date(y, m + 1, 0);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const { data: allClubs, error: clubsErr } = await supabase
      .from('clubs')
      .select('id, name, sort_order')
      .eq('is_active', 1)
      .not('id', 'in', '("global","hr")')
      .order('sort_order', { ascending: true });
    if (clubsErr) throw clubsErr;

    const clubs = allClubs || [];

    const periodDays: Date[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) { periodDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

    const toCode = (status: string | undefined, day: Date): string => {
      if (!status) return '';
      const isSunday = day.getDay() === 0;
      switch (status) {
        case 'presente': case 'capacitacion': case 'apoyo': return isSunday ? 'D' : '1';
        case 'incapacidad': return 'I';
        case 'permiso':     return 'P';
        case 'feriado':     return 'F';
        default:            return '';
      }
    };

    // Pre-load config for all clubs to avoid N+1 inside the loop
    const clubConfigs = await Promise.all(clubs.map((c: any) => getClubConfig(c.id)));
    // Use the first club's sheet_name for the template (all clubs in one workbook)
    const firstCfg = clubConfigs[0];

    const { default: ExcelJS } = await import('exceljs');
    const templateFile = half === '1' ? 'psmt-1ra-q.xlsx' : 'psmt-2da-q.xlsx';
    const templatePath = path.join(process.cwd(), 'server', 'templates', templateFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    const ws = wb.getWorksheet(firstCfg?.sheet_name ?? 'PRICESMART ');
    if (!ws) throw new Error(`Sheet "${firstCfg?.sheet_name ?? 'PRICESMART '}" no encontrada en plantilla`);

    const MONTHS_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const monthNameEs = MONTHS_ES[m];
    const periodoShort = half === '1' ? '1RA Q' : '2DA Q';
    ws.getRow(3).getCell(8).value = monthNameEs;
    ws.getRow(3).commit();
    ws.getRow(4).getCell(7).value = `PERIODO: ${periodoShort} ${monthNameEs} ${y}`;
    ws.getRow(4).getCell(8).value = periodoShort;
    ws.getRow(4).commit();
    try { (ws as any).conditionalFormattings.splice(0, (ws as any).conditionalFormattings.length); } catch {}

    const DATA_START_ROW = 9;
    const COL_N = 14;
    const MAX_DAY_COLS = 15;

    // Extract formulas from template row 9 to replicate across all employee rows
    const rowFormulas = new Map<number, string>();
    ws.getRow(DATA_START_ROW).eachCell({ includeEmpty: false }, (cell, col) => {
      if ((cell as any).formula) rowFormulas.set(col, (cell as any).formula as string);
    });
    const adjustFormula = (f: string, toRow: number): string =>
      f.replace(/([A-Z]+)(\d+)/g, (_, c, n) => parseInt(n) === DATA_START_ROW ? c + toRow : c + n);

    let rowOffset = 0;
    const hoja2Rows: Array<{ emp: any; neto: number }> = [];

    for (let ci = 0; ci < clubs.length; ci++) {
      const club = clubs[ci] as any;
      const cfg  = clubConfigs[ci];
      const { data: employees, error: empErr } = await supabase
        .from('employees')
        .select('id, full_name, cedula, position, contract_start, banco, cuenta_bancaria')
        .eq('club_id', club.id).eq('status', 'activo').order('full_name');
      if (empErr) throw empErr;

      const empList = employees || [];
      const empIds = empList.map((e: any) => e.id);

      const { data: attendance, error: attErr } = empIds.length
        ? await supabase.from('attendance').select('employee_id, date, status')
            .gte('date', fmt(startDate)).lte('date', fmt(endDate)).in('employee_id', empIds)
        : { data: [], error: null };
      if (attErr) throw attErr;

      const attMap = new Map<string, string>();
      for (const a of attendance || []) attMap.set(`${a.employee_id}:${a.date}`, a.status);

      for (let i = 0; i < empList.length; i++) {
        const emp = empList[i] as any;
        const rowIdx = DATA_START_ROW + rowOffset + i;
        const row = ws.getRow(rowIdx);
        const kronos = emp.cedula ? cfg.kronos_prefix + emp.cedula.replace(/-/g, '') : '';

        for (let c = 1; c <= COL_N + MAX_DAY_COLS - 1; c++) {
          try { const cell = row.getCell(c); if (!(cell as any).formula) cell.fill = { type: 'pattern', pattern: 'none' }; } catch {}
        }

        row.getCell(1).value  = rowOffset + i + 1;
        row.getCell(2).value  = cfg.country.toUpperCase();
        row.getCell(3).value  = emp.banco || '';
        row.getCell(4).value  = emp.cuenta_bancaria || '';
        row.getCell(5).value  = emp.cedula || '';
        row.getCell(6).value  = kronos;
        row.getCell(7).value  = emp.full_name;
        row.getCell(8).value  = 'PSMT ' + (club.name as string).toUpperCase();
        row.getCell(9).value  = 'Club ' + (club.name as string);
        row.getCell(10).value = emp.position || cfg.default_position;
        row.getCell(11).value = emp.contract_start || '';
        row.getCell(12).value = cfg.salary_mensual;
        row.getCell(13).value = cfg.salary_dia;

        for (let d = 0; d < periodDays.length && d < MAX_DAY_COLS; d++) {
          const day = periodDays[d];
          const code = toCode(attMap.get(`${emp.id}:${fmt(day)}`), day);
          row.getCell(COL_N + d).value = code || null;
        }
        row.getCell(50).value = null;
        row.getCell(51).value = null;
        row.getCell(52).value = null;

        for (const [col, formula] of rowFormulas.entries()) {
          try { row.getCell(col).value = { formula: adjustFormula(formula, rowIdx) }; } catch {}
        }
        row.commit();

        let dias = 0, doms = 0, incap = 0, fer = 0;
        for (const day of periodDays) {
          const code = toCode(attMap.get(`${emp.id}:${fmt(day)}`), day);
          if (code === '1') dias++; else if (code === 'D') doms++;
          else if (code === 'I') incap++; else if (code === 'F') fer++;
        }
        const bruto = parseFloat((dias * cfg.salary_dia + doms * cfg.salary_dom + incap * cfg.salary_dia + fer * cfg.salary_dia).toFixed(2));
        const neto  = parseFloat((bruto - bruto * cfg.css_rate).toFixed(2));
        hoja2Rows.push({ emp, neto });
      }

      rowOffset += empList.length;
    }

    const maxTemplateRow = half === '1' ? 84 : 92;
    for (let rowIdx = DATA_START_ROW + rowOffset; rowIdx <= maxTemplateRow; rowIdx++) {
      const row = ws.getRow(rowIdx);
      for (let c = 1; c <= 52; c++) {
        try { const cell = row.getCell(c); if (!(cell as any).formula) { cell.value = null; cell.fill = { type: 'pattern', pattern: 'none' }; } } catch {}
      }
      row.commit();
    }

    const ws2 = wb.getWorksheet('Hoja2');
    if (ws2) {
      const HOJA2_START = 5;
      const HOJA2_MAX   = 79;
      for (let i = 0; i < hoja2Rows.length && i < (HOJA2_MAX - HOJA2_START + 1); i++) {
        const { emp, neto } = hoja2Rows[i];
        const row2 = ws2.getRow(HOJA2_START + i);
        row2.getCell(2).value = emp.banco || '';
        row2.getCell(3).value = emp.cuenta_bancaria || '';
        row2.getCell(4).value = emp.full_name;
        row2.getCell(5).value = neto;
        row2.commit();
      }
      for (let rowIdx = HOJA2_START + hoja2Rows.length; rowIdx <= HOJA2_MAX; rowIdx++) {
        const row2 = ws2.getRow(rowIdx);
        for (let c = 2; c <= 5; c++) row2.getCell(c).value = null;
        row2.commit();
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="planilla-psmt-global.xlsx"');
    await wb.xlsx.write(res);
    res.end();

  } catch (error: any) {
    console.error('Error generando planilla PSMT global:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error al generar la planilla PSMT' });
  }
});

// Get expiring documents
router.get('/documents/expirations', canViewData, async (req, res) => {
  const { club_id: queryClubId, status } = req.query;
  const user = (req as any).user;

  const { applyDocFilter } = await resolveClubScope(user, queryClubId as string | undefined);

  try {
    let query = supabase
      .from('employee_documents')
      .select(`
        id,
        file_name,
        file_url,
        expiry_date,
        status,
        document_types ( id, name ),
        employees!inner ( id, full_name, cedula, position, status, club_id, clubs ( name ) )
      `)
      .eq('is_current', 1)
      .not('expiry_date', 'is', null)
      .eq('employees.status', 'activo');

    query = applyDocFilter(query);

    const todayStr = new Date().toISOString().split('T')[0];
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0];

    if (status === 'vencido') {
      query = query.lt('expiry_date', todayStr);
    } else if (status === 'proximo_vencer') {
      query = query.gte('expiry_date', todayStr).lte('expiry_date', thirtyDaysStr);
    } else if (status === 'vigente') {
      query = query.gt('expiry_date', thirtyDaysStr);
    }

    const { data, error } = await query.order('expiry_date', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching expiring documents:', error);
    res.status(500).json({ error: 'Error al obtener documentos por vencer' });
  }
});

// Get employees missing a specific document
router.get('/reports/missing-document', canViewData, async (req, res) => {
  const { doc_type = 'Contrato sellado' } = req.query;
  const user = (req as any).user;

  try {
    const { applyFilter } = await resolveClubScope(user, req.query.club_id as string | undefined);

    // Get all active employees
    let empQuery = supabase
      .from('employees')
      .select('id, full_name, cedula, position, club_id, clubs(name)')
      .eq('status', 'activo')
      .order('full_name', { ascending: true });

    empQuery = applyFilter(empQuery);

    const { data: employees, error: empError } = await empQuery;
    if (empError) throw empError;

    // Get employees who HAVE the document
    const { data: docTypes } = await supabase
      .from('document_types')
      .select('id')
      .ilike('name', `%${doc_type}%`)
      .limit(1);

    const docTypeId = docTypes?.[0]?.id;
    if (!docTypeId) {
      return res.json((employees || []).map(e => ({ ...e, club_name: (e.clubs as any)?.name || '' })));
    }

    const { data: hasDocs } = await supabase
      .from('employee_documents')
      .select('employee_id')
      .eq('document_type_id', docTypeId)
      .eq('is_current', 1);

    const hasDocSet = new Set((hasDocs || []).map((d: any) => d.employee_id));

    const missing = (employees || [])
      .filter(e => !hasDocSet.has(e.id))
      .map(e => ({ ...e, club_name: (e.clubs as any)?.name || '' }));

    res.json(missing);
  } catch (error) {
    console.error('Error fetching missing documents:', error);
    res.status(500).json({ error: 'Error al obtener empleados sin documento' });
  }
});

// Get checklist report
router.get('/reports/checklist', canViewData, async (req, res) => {
  const { club_id: queryClubId } = req.query;
  const user = (req as any).user;

  const { club_id, applyFilter } = await resolveClubScope(user, queryClubId as string | undefined);

  try {
    let query = supabase
      .from('employees')
      .select(`
        id,
        full_name,
        cedula,
        contract_start,
        contract_end,
        contract_type,
        club_id,
        clubs ( name ),
        employee_documents (
          id,
          file_url,
          expiry_date,
          is_current,
          document_types ( id, name )
        )
      `)
      .eq('status', 'activo')
      .order('full_name', { ascending: true });

    if (club_id && club_id !== 'all') {
      query = query.eq('club_id', club_id);
    } else {
      query = applyFilter(query);
    }

    const { data: employees, error } = await query;

    if (error) throw error;

    const checklist = employees.map(emp => {
      const docs = emp.employee_documents?.filter(d => d.is_current === 1) || [];
      
      const getDoc = (nameIncludes: string) => docs.find(d => (d.document_types as any)?.name?.toLowerCase()?.includes(nameIncludes.toLowerCase()));
      
      const cartaIngreso = getDoc('Carta de ingreso');
      const carnetVerde = getDoc('Carnet verde');
      const carnetBlanco = getDoc('Carnet blanco');
      const avisoCss = getDoc('Aviso') || getDoc('Afiliación CSS');
      
      const contratosCount = docs.filter(d => (d.document_types as any)?.name?.toLowerCase()?.includes('contrato')).length;

      let probatorioEnd = null;
      if (emp.contract_start) {
        const start = new Date(emp.contract_start);
        start.setMonth(start.getMonth() + 3);
        probatorioEnd = start.toISOString().split('T')[0];
      }

      return {
        id: emp.id,
        full_name: emp.full_name,
        cedula: emp.cedula,
        club_name: (emp.clubs as any)?.name || 'N/A',
        contract_start: emp.contract_start,
        contract_end: emp.contract_end,
        contract_type: emp.contract_type,
        probatorio_end: probatorioEnd,
        contratos_count: contratosCount,
        documents: {
          carta_ingreso: cartaIngreso ? { exists: true, file_url: cartaIngreso.file_url } : { exists: false },
          carnet_verde: carnetVerde ? { expiry_date: carnetVerde.expiry_date, file_url: carnetVerde.file_url } : null,
          carnet_blanco: carnetBlanco ? { expiry_date: carnetBlanco.expiry_date, file_url: carnetBlanco.file_url } : null,
          aviso_css: avisoCss ? { expiry_date: avisoCss.expiry_date, file_url: avisoCss.file_url } : null,
        }
      };
    });

    res.json(checklist);
  } catch (error) {
    console.error('Error fetching checklist:', error);
    res.status(500).json({ error: 'Error al obtener el checklist' });
  }
});

// In-memory cache for dashboard stats (TTL: 5 minutes per country/club scope)
const dashboardCache = new Map<string, { data: any; ts: number }>();
const DASHBOARD_CACHE_TTL = 5 * 60 * 1000;

// Get dashboard stats
router.get('/dashboard', canViewData, async (req, res) => {
  const { club_id: queryClubId } = req.query;
  const user = (req as any).user;

  const { club_id, allowedClubIds, applyFilter, applyDocFilter } =
    await resolveClubScope(user, queryClubId as string | undefined);

  // Cache key: scoped by country + club filter (never mixes data between scopes)
  const cacheKey = `${user.country || 'global'}_${club_id || 'all'}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DASHBOARD_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    // 1. Total Employees
    let empQuery = supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'activo');
    empQuery = applyFilter(empQuery);
    const { count: totalEmployees } = await empQuery;

    // 2. Expired Documents
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Fetch expired employee documents
    let expiredDocsQuery = supabase
      .from('employee_documents')
      .select('id, expiry_date, document_types!inner(name, has_expiry), employees!inner(id, full_name, club_id, status, contract_type)')
      .eq('is_current', 1)
      .eq('document_types.has_expiry', 1)
      .not('expiry_date', 'is', null)
      .lt('expiry_date', todayStr)
      .eq('employees.status', 'activo');
      
    expiredDocsQuery = applyDocFilter(expiredDocsQuery);
    
    const { data: expiredDocsData } = await expiredDocsQuery;
    
    // Fetch expired contracts
    let expiredContractsQuery = supabase
      .from('employees')
      .select('id, full_name, contract_end, contract_type')
      .eq('status', 'activo')
      .not('contract_end', 'is', null)
      .lt('contract_end', todayStr);
      
    expiredContractsQuery = applyFilter(expiredContractsQuery);
    
    const { data: expiredContractsData } = await expiredContractsQuery;
    
    // Build set of employee IDs that already have a contract document in expired docs
    // to avoid showing duplicate "Contrato" entries when "Contrato firmado" already appears
    const expiredEmployeesWithContractDoc = new Set(
      (expiredDocsData || [])
        .filter(d => (d.document_types as any).name?.toLowerCase().includes('contrato') &&
                     (d.employees as any).contract_type?.toLowerCase() !== 'indefinido')
        .map(d => (d.employees as any).id)
    );

    const expiredList = [
      ...(expiredDocsData || [])
        .filter(d => {
          const docName = (d.document_types as any).name?.toLowerCase() || '';
          const contractType = (d.employees as any).contract_type?.toLowerCase() || '';
          // Ignore any 'contrato' expiration if contract is 'Indefinido'
          if (docName.includes('contrato') && contractType === 'indefinido') {
            return false;
          }
          return true;
        })
        .map(d => ({
        id: d.id,
        employee_id: (d.employees as any).id,
        employee_name: (d.employees as any).full_name,
        type: (d.document_types as any).name,
        date: d.expiry_date,
        status: 'expired'
      })),
      ...(expiredContractsData || [])
        .filter(e => e.contract_type?.toLowerCase() !== 'indefinido' && !expiredEmployeesWithContractDoc.has(e.id))
        .map(e => ({
        id: `contract-${e.id}`,
        employee_id: e.id,
        employee_name: e.full_name,
        type: 'Contrato',
        date: e.contract_end,
        status: 'expired'
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const expiredDocuments = expiredList.length;

    // 3. Expiring Soon
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const dateStr = thirtyDaysFromNow.toISOString().split('T')[0];
    
    // Fetch expiring employee documents
    let expiringDocsQuery = supabase
      .from('employee_documents')
      .select('id, expiry_date, document_types!inner(name, has_expiry), employees!inner(id, full_name, club_id, status, contract_type)')
      .eq('is_current', 1)
      .eq('document_types.has_expiry', 1)
      .gte('expiry_date', todayStr)
      .lte('expiry_date', dateStr)
      .eq('employees.status', 'activo');
      
    expiringDocsQuery = applyDocFilter(expiringDocsQuery);
    
    const { data: expiringDocsData } = await expiringDocsQuery;
    
    // Fetch expiring contracts
    let expiringContractsQuery = supabase
      .from('employees')
      .select('id, full_name, contract_end, contract_type')
      .eq('status', 'activo')
      .gte('contract_end', todayStr)
      .lte('contract_end', dateStr);
      
    expiringContractsQuery = applyFilter(expiringContractsQuery);
    
    const { data: expiringContractsData } = await expiringContractsQuery;
    
    // Same deduplication for expiring docs
    const expiringEmployeesWithContractDoc = new Set(
      (expiringDocsData || [])
        .filter(d => (d.document_types as any).name?.toLowerCase().includes('contrato') &&
                     (d.employees as any).contract_type?.toLowerCase() !== 'indefinido')
        .map(d => (d.employees as any).id)
    );

    const expiringList = [
      ...(expiringDocsData || [])
        .filter(d => {
          const docName = (d.document_types as any).name?.toLowerCase() || '';
          const contractType = (d.employees as any).contract_type?.toLowerCase() || '';
          // Ignore any 'contrato' expiration if contract is 'Indefinido'
          if (docName.includes('contrato') && contractType === 'indefinido') {
            return false;
          }
          return true;
        })
        .map(d => ({
        id: d.id,
        employee_id: (d.employees as any).id,
        employee_name: (d.employees as any).full_name,
        type: (d.document_types as any).name,
        date: d.expiry_date,
        status: 'expiring'
      })),
      ...(expiringContractsData || [])
        .filter(e => e.contract_type?.toLowerCase() !== 'indefinido' && !expiringEmployeesWithContractDoc.has(e.id))
        .map(e => ({
        id: `contract-${e.id}`,
        employee_id: e.id,
        employee_name: e.full_name,
        type: 'Contrato',
        date: e.contract_end,
        status: 'expiring'
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const expiringSoonDocuments = expiringList.length;

    // 4. Incomplete Employees (Simplified for Supabase without complex SQL)
    // For now, we'll just return 0 to avoid complex RPC calls, 
    // in a real app you'd create a Postgres function for this
    const incompleteEmployees = 0;

    // 5. Uploaded Today
    const needsFilter = !!club_id || allowedClubIds !== null;
    // For single club_id: need inner join to filter on employees.club_id
    // For allowedEmployeeIds: filter directly on employee_id (no join needed)
    let uploadedTodayQuery = supabase
      .from('employee_documents')
      .select(club_id ? 'id, uploaded_at, employees!inner(club_id)' : 'id, uploaded_at')
      .gte('uploaded_at', todayStr + 'T00:00:00.000Z');
    if (needsFilter) {
      uploadedTodayQuery = applyDocFilter(uploadedTodayQuery);
    }
    const { data: uploadedTodayDocs } = await uploadedTodayQuery;
    const documentsUploadedToday = uploadedTodayDocs?.length || 0;

    // 6. Club Distribution
    let clubsQuery = supabase.from('clubs').select('id, name').neq('id', 'global').neq('id', 'hr');
    if (club_id) {
      clubsQuery = clubsQuery.eq('id', club_id);
    } else if (allowedClubIds !== null) {
      clubsQuery = allowedClubIds.length > 0 ? clubsQuery.in('id', allowedClubIds) : clubsQuery.in('id', ['__none__']);
    }
    const { data: clubs } = await clubsQuery;

    let activeEmpDistQuery = supabase.from('employees').select('club_id').eq('status', 'activo');
    activeEmpDistQuery = applyFilter(activeEmpDistQuery);
    const { data: activeEmployees } = await activeEmpDistQuery;
    
    const clubDistribution = clubs?.map(club => {
      const count = activeEmployees?.filter(e => e.club_id === club.id).length || 0;
      return { name: club.name, value: count };
    }) || [];

    // 7. Performance Stats (Internal Only)
    let performanceStats = null;
    const internalRoles = ['Super Administrador', 'Administrador', 'Supervisor Interno'];
    if (user && internalRoles.includes(user.role)) {
      const { data: perfData } = await supabase
        .from('daily_performance')
        .select('meta, actual_sales')
        .gte('date', todayStr);
      
      if (perfData) {
        performanceStats = perfData.reduce((acc: any, curr: any) => {
          acc.totalMeta += curr.meta || 0;
          acc.totalVentas += curr.actual_sales || 0;
          return acc;
        }, { totalMeta: 0, totalVentas: 0 });
      }
    }

    const result = {
      totalEmployees: totalEmployees || 0,
      expiredDocuments,
      expiringSoonDocuments,
      incompleteEmployees,
      documentsUploadedToday,
      clubDistribution,
      performanceStats,
      expiredList,
      expiringList
    };

    dashboardCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// GET /api/analytics/projections — contract expirations bucketed by month for next 12 months
router.get('/analytics/projections', canViewData, async (req, res) => {
  const { club_id: queryClubId } = req.query;
  const user = (req as any).user;
  const { applyFilter } = await resolveClubScope(user, queryClubId as string | undefined);

  try {
    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth() + 12, today.getDate());

    let q = supabase
      .from('employees')
      .select('contract_end, club_id')
      .eq('status', 'activo')
      .not('contract_end', 'is', null)
      .neq('contract_type', 'Indefinido')
      .gte('contract_end', today.toISOString().split('T')[0])
      .lte('contract_end', endDate.toISOString().split('T')[0]);
    q = applyFilter(q);

    const [{ data: employees }, { data: clubs }] = await Promise.all([
      q,
      supabase.from('clubs').select('id, name'),
    ]);

    const clubMap = new Map((clubs || []).map(c => [c.id, c.name]));

    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      return {
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString(process.env.APP_DEFAULT_LOCALE || 'es-PA', { month: 'short', year: '2-digit' }),
        count: 0,
        clubs: [] as { name: string; count: number }[],
      };
    });

    (employees || []).forEach(emp => {
      const ym = (emp.contract_end as string).substring(0, 7);
      const bucket = months.find(m => m.month === ym);
      if (!bucket) return;
      bucket.count++;
      const clubName = clubMap.get(emp.club_id) || 'Sin club';
      const existing = bucket.clubs.find(c => c.name === clubName);
      if (existing) existing.count++;
      else bucket.clubs.push({ name: clubName, count: 1 });
    });

    res.json(months);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener proyecciones' });
  }
});

// GET /api/analytics/compliance — document compliance rate per club
router.get('/analytics/compliance', canViewData, async (req, res) => {
  const { club_id: queryClubId } = req.query;
  const user = (req as any).user;
  const { club_id, allowedClubIds, applyFilter, applyDocFilter } =
    await resolveClubScope(user, queryClubId as string | undefined);

  try {
    const today = new Date().toISOString().split('T')[0];

    let clubsQuery = supabase.from('clubs').select('id, name').neq('id', 'global').neq('id', 'hr');
    if (club_id) {
      clubsQuery = clubsQuery.eq('id', club_id);
    } else if (allowedClubIds !== null) {
      clubsQuery = allowedClubIds.length > 0
        ? clubsQuery.in('id', allowedClubIds)
        : clubsQuery.in('id', ['__none__']);
    }
    const { data: clubs } = await clubsQuery;

    let empQuery = supabase.from('employees').select('id, club_id').eq('status', 'activo');
    empQuery = applyFilter(empQuery);
    const { data: activeEmps } = await empQuery;

    let expiredQuery = supabase
      .from('employee_documents')
      .select('employees!inner(id, club_id, status), document_types!inner(has_expiry)')
      .eq('is_current', 1)
      .eq('document_types.has_expiry', 1)
      .not('expiry_date', 'is', null)
      .lt('expiry_date', today)
      .eq('employees.status', 'activo');
    expiredQuery = applyDocFilter(expiredQuery);
    const { data: expiredDocs } = await expiredQuery;

    const empIdsWithExpired = new Set(
      (expiredDocs || []).map(d => (d.employees as any).id)
    );

    const result = (clubs || [])
      .map(club => {
        const total = (activeEmps || []).filter(e => e.club_id === club.id).length;
        const withExpired = (activeEmps || []).filter(
          e => e.club_id === club.id && empIdsWithExpired.has(e.id)
        ).length;
        const compliance = total > 0 ? Math.round(((total - withExpired) / total) * 100) : 100;
        return { name: club.name, total, withExpired, compliance };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => a.compliance - b.compliance);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener cumplimiento' });
  }
});

// User management routes
router.get('/users', isAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    let query = supabase.from('users').select('id, email, name, role, club_id, country, is_active');

    // Admin de País solo ve usuarios de su país
    if (user.role === 'Administrador' && user.country) {
      query = query.eq('country', user.country);
    }
    // Super Administrador ve todos

    const { data: users, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(users);
  } catch (error: any) {
    console.error('Error in /users:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/users', isAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { email, password, name, role, club_id, country } = parsed.data;
  try {
    const id = crypto.randomUUID();
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ id, email, password_hash: hashedPassword, name, role, club_id: club_id || null, country: country || null }])
      .select('id, email, name, role, club_id, is_active')
      .single();
      
    if (error) throw error;
    
    // Log audit
    await logAudit(
      req,
      'Creación de usuario',
      `Usuario creado: ${name} (${email})`,
      'Usuario', id, name, club_id
    );
    
    res.status(201).json(newUser);
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

router.patch('/users/:id', isAdmin, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { email, password, name, role, club_id, country, is_active } = parsed.data;
  try {
    const updateData: any = {
      email,
      name,
      role,
      club_id: club_id || null,
      country: country || null,
      is_active: is_active === undefined ? 1 : is_active,
      updated_at: new Date().toISOString()
    };

    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }
    
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id)
      .select('id, email, name, role, club_id, is_active')
      .single();
      
    if (error) throw error;
    
    // Log audit
    await logAudit(
      req,
      'Actualización de usuario',
      `Usuario actualizado: ${name} (${email})`,
      'Usuario', req.params.id, name, club_id
    );
    
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

router.delete('/users/:id', isAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    // Don't allow deleting the last administrator
    const { count: adminCount } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'Administrador');
    const { data: userToDelete } = await supabase.from('users').select('role').eq('id', userId).single();
    
    if (!userToDelete) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (userToDelete.role === 'Administrador' && (adminCount || 0) <= 1) {
      return res.status(400).json({ error: 'No se puede eliminar el último administrador del sistema' });
    }

    // Nullify references in other tables
    await supabase.from('employees').update({ created_by: null }).eq('created_by', userId);
    await supabase.from('employee_documents').update({ uploaded_by: null }).eq('uploaded_by', userId);
    await supabase.from('audit_logs').update({ user_id: null }).eq('user_id', userId);
    
    // Finally delete the user
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) throw error;

    // Log audit
    await logAudit(
      req,
      'Eliminación de usuario',
      `Usuario eliminado: ID ${userId}`,
      'Usuario', userId, null, null
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario: ' + error.message });
  }
});

// Alert recipients routes
router.get('/alert-recipients', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { data: recipients, error } = await supabase
      .from('alert_recipients')
      .select('*, clubs(name)');
      
    if (error) return res.status(500).json({ error: error.message });
    
    const formattedRecipients = recipients.map(r => ({
      ...r,
      club_id: r.club_id || 'global',
      club_name: (r.clubs as any)?.name || 'Global'
    }));
    
    res.json(formattedRecipients);
  } catch (error: any) {
    console.error('Error in /alert-recipients:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/alert-recipients', isAuthenticated, isAdmin, async (req, res) => {
  const { club_id, emails } = req.body; // emails is an array of strings
  
  try {
    if (club_id === 'global') {
      // Ensure the 'global' club exists to satisfy foreign key constraints
      const { data: globalClub } = await supabase.from('clubs').select('id').eq('id', 'global').maybeSingle();
      if (!globalClub) {
        await supabase.from('clubs').upsert([{ id: 'global', name: 'Global', description: 'Destinatarios Globales', is_active: 1 }]);
      }
      await supabase.from('alert_recipients').delete().eq('club_id', 'global');
    } else {
      await supabase.from('alert_recipients').delete().eq('club_id', club_id);
    }
    
    if (emails && emails.length > 0) {
      const insertData = emails.map((email: string) => ({
        id: crypto.randomUUID(),
        club_id: club_id,
        email
      }));
      
      const { error } = await supabase.from('alert_recipients').insert(insertData);
      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in alert-recipients POST:', error);
    res.status(500).json({ error: error.message || 'Error al actualizar destinatarios' });
  }
});

// Test alert route
router.post('/test-alert', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await sendExpirationAlerts(true);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (error) {
    console.error('Error sending test alert:', error);
    res.status(500).json({ error: 'Error al enviar alerta de prueba' });
  }
});

// Alert routes
router.post('/alerts/send', isAdmin, async (req, res) => {
  try {
    const result = await sendExpirationAlerts(true);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Error al enviar alertas' });
    }
    res.json(result);
  } catch (error) {
    console.error('Error sending alerts:', error);
    res.status(500).json({ error: 'Error al enviar alertas' });
  }
});

// Backup routes
router.get('/backup/database', (req, res) => {
  res.status(400).json({ error: 'El respaldo de base de datos ya no está disponible con Supabase. Use el panel de Supabase para respaldos.' });
});

router.get('/backup/employees-csv', async (req, res) => {
  try {
    const { data: employees, error } = await supabase
      .from('employees')
      .select('full_name, cedula, position, status, contract_type, contract_start, clubs(name)')
      .order('full_name', { ascending: true });

    if (error) throw error;

    if (!employees || employees.length === 0) {
      return res.status(404).json({ error: 'No hay empleados para exportar' });
    }

    const headers = ['Nombre Completo', 'Cedula', 'Cargo', 'Estado', 'Club', 'Tipo Contrato', 'Fecha Ingreso'];
    const rows = employees.map(e => [
      `"${e.full_name}"`,
      `"${e.cedula}"`,
      `"${e.position}"`,
      `"${e.status}"`,
      `"${(e.clubs as any)?.name || ''}"`,
      `"${e.contract_type}"`,
      `"${e.contract_start}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Empleados_PSMT_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('CSV Export error:', error);
    res.status(500).json({ error: 'Error al exportar empleados' });
  }
});

// Restore route
router.post('/restore/database', (req, res) => {
  res.status(400).json({ error: 'La restauración de base de datos ya no está disponible con Supabase. Use el panel de Supabase para restaurar.' });
});

// AI Chat assistant
router.post('/ai/chat', isAuthenticated, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Pregunta requerida' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Asistente IA no configurado' });

    const user = (req as any).user;
    const isPrivileged = ['Administrador', 'Supervisor Interno', 'Supervisora'].includes(user.role);

    let contextBlock = '';

    if (isPrivileged) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const { data: clubs } = await supabase.from('clubs').select('id, name').neq('id', 'global');
        const { data: employees } = await supabase.from('employees').select('id, full_name, club_id').eq('status', 'activo');
        const { data: expired } = await supabase
          .from('employee_documents')
          .select('expiry_date, document_types(name), employees(full_name, club_id)')
          .eq('is_current', 1)
          .lt('expiry_date', today)
          .limit(50);
        const { data: expiring } = await supabase
          .from('employee_documents')
          .select('expiry_date, document_types(name), employees(full_name, club_id)')
          .eq('is_current', 1)
          .gte('expiry_date', today)
          .lte('expiry_date', thirtyDays)
          .limit(50);

        const clubLines = clubs?.map(club => {
          const empCount = employees?.filter(e => e.club_id === club.id).length || 0;
          const expCount = expired?.filter(d => (d.employees as any)?.club_id === club.id).length || 0;
          const proxCount = expiring?.filter(d => (d.employees as any)?.club_id === club.id).length || 0;
          return `- ${club.name}: ${empCount} empleados, ${expCount} docs vencidos, ${proxCount} próximos a vencer`;
        }).join('\n') || 'Sin datos de clubs';

        const expiredLines = expired?.slice(0, 20).map(d =>
          `  • ${(d.employees as any)?.full_name || 'Desconocido'} — ${(d.document_types as any)?.name || 'Documento'} (venció ${d.expiry_date})`
        ).join('\n') || 'Ninguno';

        contextBlock = `
DATOS ACTUALES (${today}):
Estado por club:
${clubLines}

Documentos vencidos:
${expiredLines}

Totales: ${employees?.length || 0} empleados activos, ${expired?.length || 0} docs vencidos, ${expiring?.length || 0} próximos a vencer (30 días).`;
      } catch (dbErr) {
        console.error('AI chat DB error:', dbErr);
        contextBlock = '\n(No se pudo cargar el contexto de la base de datos en este momento.)';
      }
    }

    const systemPrompt = isPrivileged
      ? `Eres el asistente inteligente de ControlDoc, la plataforma de gestión documental de PSMT. Responde siempre en español, de forma concisa y útil.${contextBlock}\n\nResponde la pregunta del usuario con base en estos datos.`
      : `Eres el asistente de ayuda de ControlDoc de PSMT. Responde en español, de forma amable y clara. Ayuda a los usuarios con el uso de la plataforma: Check List (vencimientos), Check List 1 Año (contratos anuales), Asistencia, Clubes, Empleados y Configuración. No tienes acceso a datos privados.`;

    const genAI = new GoogleGenAI({ apiKey });
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${systemPrompt}\n\nPregunta: ${question}`,
    });

    const text = result.text || 'No se pudo generar una respuesta.';
    res.json({ response: text });
  } catch (error: any) {
    console.error('AI chat error:', error?.message || error);
    res.status(500).json({ error: `Error: ${error?.message || 'Error al procesar tu pregunta'}` });
  }
});

// POST /api/employees/import-birthdays
router.post('/employees/import-birthdays', isAuthenticated, async (req, res) => {
  const records: { name: string; birth_date: string }[] = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'Se esperaba un array' });

  const user = (req as any).user;
  const allowedEditRoles = ['Super Administrador', 'Administrador', 'Supervisor Interno', 'Recursos Humanos'];
  if (!allowedEditRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Sin permiso para importar cumpleaños' });
  }
  const scopedClubId = user.role === 'Supervisor Interno' ? user.club_id : undefined;

  // Validate date format for each record upfront
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const validRecords = records.filter(r => r.name?.trim() && r.birth_date && dateRegex.test(r.birth_date));

  // Lookup all employees in parallel (instead of sequential await per record)
  const lookups = await Promise.all(
    validRecords.map(async (r) => {
      let q = supabase.from('employees').select('id').ilike('full_name', r.name.trim());
      if (scopedClubId) q = q.eq('club_id', scopedClubId);
      const { data } = await q;
      return { record: r, ids: (data || []).map((e: any) => e.id) };
    })
  );

  // Collect all updates as {id, birth_date} pairs
  const updates: { id: string; birth_date: string }[] = [];
  const notFound: string[] = [];

  for (const { record, ids } of lookups) {
    if (ids.length > 0) {
      ids.forEach(id => updates.push({ id, birth_date: record.birth_date }));
    } else {
      notFound.push(record.name);
    }
  }

  // Single batch upsert instead of N individual updates
  let updated = 0;
  if (updates.length > 0) {
    const { error } = await supabase
      .from('employees')
      .upsert(updates, { onConflict: 'id' });
    if (!error) updated = new Set(updates.map(u => u.id)).size;
  }

  res.json({ updated, notFound });
});

// DELETE /api/employees/:id/birth-date — clear birth_date for a single employee
router.delete('/employees/:id/birth-date', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  const allowedRoles = ['Administrador', 'Supervisor Interno', 'Recursos Humanos'];
  if (!allowedRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Sin permiso' });
  }

  const { error } = await supabase
    .from('employees')
    .update({ birth_date: null })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Push Notifications ──────────────────────────────────────────────────────
router.get('/push/vapid-public-key', isAuthenticated, (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  res.json({ publicKey: key });
});

router.post('/push/subscribe', isAuthenticated, async (req, res) => {
  const user = (req as any).user;
  const { endpoint, p256dh, auth } = req.body;
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'Datos incompletos' });

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint, p256dh, auth },
    { onConflict: 'endpoint' }
  );
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete('/push/subscribe', isAuthenticated, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint requerido' });

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
// ─── GET /payroll/psmt-from-gsheet ───────────────────────────────────────────
// Generates PSMT from Google Sheets programación files configured per-club.
// Query: year, month, half, clubId (optional — omit for all configured clubs)
router.get('/payroll/psmt-from-gsheet', isAuthenticated, async (req: any, res: any) => {
  try {
    const allowed = ['Administrador', 'Super Administrador', 'Recursos Humanos', 'Supervisora Redvolution'];
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Sin permiso para generar planilla PSMT' });
    }

    const { year, month, half, clubId: singleClubId } = req.query as Record<string, string>;
    if (!year || !month || !['1', '2'].includes(half)) {
      return res.status(400).json({ error: 'Parámetros requeridos: year, month, half (1 o 2)' });
    }

    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!credentialsJson) {
      return res.status(503).json({ error: 'Google Sheets no configurado. Contactá a un administrador.' });
    }

    const y = parseInt(year);
    const m = parseInt(month) - 1;
    const startDay = half === '1' ? 1 : 16;
    const endDay   = half === '1' ? 15 : new Date(y, m + 1, 0).getDate();
    const startDate = half === '1' ? new Date(y, m, 1) : new Date(y, m, 16);
    const endDate   = half === '1' ? new Date(y, m, 15) : new Date(y, m + 1, 0);

    const MONTHS_ES   = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const monthNameEs  = MONTHS_ES[m];
    const periodoShort = half === '1' ? '1RA Q' : '2DA Q';

    const periodDays: Date[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) { periodDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const normalize = (s: string) =>
      s.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

    const progToCode = (mark: string | undefined, day: Date): string => {
      if (!mark) return '';
      const isSunday = day.getDay() === 0;
      switch (mark) {
        case 'A': return isSunday ? 'D' : '1';
        case 'P': return 'P';
        case 'I': return 'I';
        case 'F': return 'F';
        default:  return '';
      }
    };

    // ── Load clubs with configured sheets ──
    let clubList: any[];
    if (singleClubId) {
      const { data, error } = await supabase.from('clubs').select('id, name, sort_order').eq('id', singleClubId).limit(1);
      if (error) throw error;
      clubList = data || [];
    } else {
      const { data, error } = await supabase.from('clubs').select('id, name, sort_order').eq('is_active', 1).not('id', 'in', '("global","hr")').order('sort_order', { ascending: true });
      if (error) throw error;
      clubList = data || [];
    }

    const clubConfigs = await Promise.all(clubList.map((c: any) => getClubConfig(c.id)));
    const configuredClubs = clubList.filter((_: any, i: number) => clubConfigs[i].programacion_sheet_id);
    const configuredCfgs  = clubConfigs.filter(cfg => cfg.programacion_sheet_id);

    if (configuredClubs.length === 0) {
      return res.status(400).json({ error: 'Ningún club tiene Google Sheet configurado. Contactá a un administrador.' });
    }

    // ── Fetch all sheets in parallel ──
    const { google } = (await import('googleapis')) as any;
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credentialsJson),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const progAttMap = new Map<string, Map<string, string>>();

    for (let ci = 0; ci < configuredClubs.length; ci++) {
      const cfg      = configuredCfgs[ci];
      const sheetId  = cfg.programacion_sheet_id!;
      const hRow     = cfg.prog_header_row;
      const nCol     = cfg.prog_name_col;
      const dsRow    = cfg.prog_data_start_row;

      // Auto-detect tab name: try "AGOSTO 2026" → "Agosto 2026" → "agosto 2026"
      const expectedTab = `${monthNameEs} ${y}`;
      let tabName: string | null = null;
      try {
        const metaResp = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties.title' });
        const sheetTitles: string[] = (metaResp.data.sheets || []).map((s: any) => s.properties?.title || '');
        tabName = sheetTitles.find((t: string) => t.trim().toUpperCase() === expectedTab.toUpperCase())
          || sheetTitles.find((t: string) => t.trim().toUpperCase().includes(monthNameEs) && t.includes(String(y)))
          || null;
      } catch {
        return res.status(400).json({ error: `No se pudo acceder al Google Sheet del club "${cfg.name}". Verificá que el sheet esté compartido con la cuenta de servicio.` });
      }

      if (!tabName) {
        return res.status(400).json({ error: `Hoja "${expectedTab}" no encontrada en el Google Sheet de "${cfg.name}".` });
      }

      const valResp = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${tabName}'!A1:AZ`,
      });
      const values: string[][] = valResp.data.values || [];

      // Build dayColMap from header row (1-indexed → 0-indexed)
      const dayColMap: Record<number, number> = {};
      const headerRowData = values[hRow - 1] || [];
      for (let C = 0; C < headerRowData.length; C++) {
        const val = Number(headerRowData[C]);
        if (!isNaN(val) && val >= startDay && val <= endDay) dayColMap[val] = C;
      }

      // Build progAttMap from data rows
      for (let R = dsRow - 1; R < values.length; R++) {
        const row = values[R] || [];
        const rawName = (row[nCol - 1] || '').trim();
        if (!rawName) continue;
        const normName = normalize(rawName);
        if (!progAttMap.has(normName)) progAttMap.set(normName, new Map());
        const empMarks = progAttMap.get(normName)!;
        for (let day = startDay; day <= endDay; day++) {
          const col = dayColMap[day];
          if (col === undefined) continue;
          const mark = (row[col] || '').trim().toUpperCase();
          if (!mark) continue;
          const mm = String(m + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          empMarks.set(`${y}-${mm}-${dd}`, mark);
        }
      }
    }

    // ── Matching helpers ──
    const matchedProgKeys = new Set<string>();
    const LEGEND_KEYS = ['ASIGNADA', 'POR ASIGNAR', 'PARA CAPACITACION', 'PERMISO SOLICITADO',
      'INCAPACIDAD', 'AUSENCIA', 'LIMPIEZA', 'REEMPLAZO', 'TRASLADO',
      'BACKUP', 'VACACIONES', 'DESCANSO', 'IN HOUSE', 'SOLICITUD'];

    const levenshtein = (a: string, b: string): number => {
      const mo = a.length, n = b.length;
      const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
      for (let i = 1; i <= mo; i++) {
        let prev = i;
        for (let j = 1; j <= n; j++) {
          const c = a[i - 1] === b[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j], prev, dp[j - 1]);
          dp[j - 1] = prev; prev = c;
        }
        dp[n] = prev;
      }
      return dp[n];
    };

    const findProgMarks = (empFullName: string): Map<string, string> | undefined => {
      const normEmp = normalize(empFullName);
      const exact = progAttMap.get(normEmp);
      if (exact) { matchedProgKeys.add(normEmp); return exact; }
      for (const [progName, marks] of progAttMap) {
        if (progName.startsWith(normEmp + ' ') || normEmp.startsWith(progName + ' ')) {
          matchedProgKeys.add(progName); return marks;
        }
      }
      const FUZZY_MAX = 2;
      let bestKey: string | null = null, bestDist = FUZZY_MAX + 1;
      let ambiguous = false;
      for (const progName of progAttMap.keys()) {
        const dist = levenshtein(normEmp, progName);
        if (dist <= FUZZY_MAX) {
          if (dist < bestDist) { bestDist = dist; bestKey = progName; ambiguous = false; }
          else if (dist === bestDist) { ambiguous = true; }
        }
      }
      if (bestKey && !ambiguous) { matchedProgKeys.add(bestKey); return progAttMap.get(bestKey); }
      return undefined;
    };

    const addSinMatchSheetGS = (workbook: any, unmatchedDB: Array<{ club: string; name: string }>) => {
      const unmatchedExcel = [...progAttMap.keys()].filter(k =>
        !matchedProgKeys.has(k) && !LEGEND_KEYS.some(lk => k.includes(normalize(lk)))
      );
      if (unmatchedDB.length === 0 && unmatchedExcel.length === 0) return;
      const wsm = workbook.addWorksheet('SIN MATCH');
      const hdr = wsm.addRow(['TIPO', 'CLUB', 'NOMBRE EN SISTEMA', 'DETALLE']);
      hdr.font = { bold: true };
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } };
      unmatchedDB.forEach((u: any) => wsm.addRow([
        'DB sin match en Sheet', u.club, u.name, 'No se encontro en la programacion — revisar nombre'
      ]));
      if (unmatchedDB.length > 0 && unmatchedExcel.length > 0) wsm.addRow([]);
      unmatchedExcel.forEach((n: string) => wsm.addRow([
        'Sheet sin registro en DB', '', n, 'Empleada no registrada en el sistema'
      ]));
      wsm.columns = [{ width: 28 }, { width: 18 }, { width: 32 }, { width: 56 }];
    };

    // ── Generate PSMT Excel (same template logic as multi-club mode) ──
    const { default: ExcelJS } = await import('exceljs');
    const templateFile = half === '1' ? 'psmt-1ra-q.xlsx' : 'psmt-2da-q.xlsx';
    const templatePath = path.join(process.cwd(), 'server', 'templates', templateFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    const firstCfg = configuredCfgs[0];
    const wsPsmt = wb.getWorksheet(firstCfg.sheet_name);
    if (!wsPsmt) throw new Error(`Sheet "${firstCfg.sheet_name}" no encontrada en plantilla PSMT`);

    wsPsmt.getRow(3).getCell(8).value = monthNameEs; wsPsmt.getRow(3).commit();
    wsPsmt.getRow(4).getCell(7).value = `PERIODO: ${periodoShort} ${monthNameEs} ${y}`;
    wsPsmt.getRow(4).getCell(8).value = periodoShort; wsPsmt.getRow(4).commit();
    try { (wsPsmt as any).conditionalFormattings.splice(0, (wsPsmt as any).conditionalFormattings.length); } catch {}

    const nullValObjGS = {
      get type() { return 0; }, get formula() { return ''; },
      get value() { return null; }, get model() { return { type: 0 }; },
      release() {}, acquire() {}
    };
    for (const row of ((wsPsmt as any)._rows || [])) {
      if (!row) continue;
      for (const cell of ((row as any)._cells || [])) {
        if (!cell) continue;
        const v = (cell as any)._value;
        if (v && v.model?.type === 6 && v.model?.formula == null) {
          try {
            const resolved = String(v.formula ?? '');
            if (resolved) { (v.model as any).formula = resolved; delete (v.model as any).sharedFormula; }
            else { (cell as any)._value = nullValObjGS; }
          } catch { (cell as any)._value = nullValObjGS; }
        }
      }
    }

    const DATA_START = 9, COL_N = 14, HEADER_ROW = 8;
    const numDays = periodDays.length;
    const calcColMap: Record<string, number> = {};
    const labelMap: Array<[string, string]> = [
      ['TOTAL DOMINGOS', 'totalDoms'], ['TOTAL INCAPACIDAD', 'totalIncap'],
      ['TOTAL PERMISO', 'totalPermiso'], ['TOTAL FERIADO', 'totalFeriado'],
      ['DIAS LABORADOS', 'dias'], ['DOMINGOS LABORADOS', 'doms'],
      ['INCAPACIDAD', 'incap'], ['PERMISO', 'permiso'], ['FERIADO', 'feriado'],
      ['BRUTO', 'bruto'], ['CSS', 'css'], ['NETO', 'neto'],
    ];
    const stripAcc = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    wsPsmt.getRow(HEADER_ROW).eachCell({ includeEmpty: false }, (cell: any, col: number) => {
      const text = stripAcc(String(cell.value ?? ''));
      for (const [label, key] of labelMap) {
        if (text.includes(label) && !calcColMap[key]) { calcColMap[key] = col; break; }
      }
    });
    const firstCalcCol = Math.min(...[calcColMap.dias, calcColMap.doms, calcColMap.totalDoms].filter(Boolean as any));
    const maxDaySlots  = (firstCalcCol && isFinite(firstCalcCol)) ? firstCalcCol - COL_N : 15;

    let rowOffset = 0;
    const hoja2Rows: Array<{ emp: any; neto: number }> = [];
    const unmatchedDB: Array<{ club: string; name: string }> = [];

    for (let ci = 0; ci < configuredClubs.length; ci++) {
      const club = configuredClubs[ci];
      const cfg  = configuredCfgs[ci];
      const { data: empData, error: empErr } = await supabase
        .from('employees')
        .select('id, full_name, cedula, position, contract_start, banco, cuenta_bancaria')
        .eq('club_id', club.id).eq('status', 'activo').order('full_name');
      if (empErr) throw empErr;
      const empList = empData || [];

      for (let i = 0; i < empList.length; i++) {
        const emp      = empList[i] as any;
        const seqNo    = rowOffset + i + 1;
        const row      = wsPsmt.getRow(DATA_START + rowOffset + i);
        const kronos   = emp.cedula ? cfg.kronos_prefix + emp.cedula.replace(/-/g, '') : '';
        const empMarks = findProgMarks(emp.full_name);
        if (!empMarks) unmatchedDB.push({ club: cfg.name as string, name: emp.full_name });

        let dias = 0, doms = 0, incap = 0, permiso = 0, fer = 0;
        for (const day of periodDays) {
          const code = progToCode(empMarks?.get(fmt(day)), day);
          if      (code === '1') dias++;
          else if (code === 'D') doms++;
          else if (code === 'I') incap++;
          else if (code === 'P') permiso++;
          else if (code === 'F') fer++;
        }
        const bruto = parseFloat((dias * cfg.salary_dia + doms * cfg.salary_dom + incap * cfg.salary_dia + fer * cfg.salary_dia + permiso * cfg.salary_dia).toFixed(2));
        const css   = parseFloat((bruto * cfg.css_rate).toFixed(2));
        const neto  = parseFloat((bruto - css).toFixed(2));

        const clearUpTo = Math.max(COL_N + numDays - 1, 52);
        for (let c = 1; c <= clearUpTo; c++) {
          try { const cell = row.getCell(c); if (!(cell as any).formula) cell.fill = { type: 'pattern', pattern: 'none' }; } catch {}
        }
        row.getCell(1).value  = seqNo;
        row.getCell(2).value  = cfg.country.toUpperCase();
        row.getCell(3).value  = emp.banco || '';
        row.getCell(4).value  = emp.cuenta_bancaria || '';
        row.getCell(5).value  = emp.cedula || '';
        row.getCell(6).value  = kronos;
        row.getCell(7).value  = emp.full_name;
        row.getCell(8).value  = 'PSMT ' + (cfg.name as string).toUpperCase();
        row.getCell(9).value  = 'Club ' + cfg.name;
        row.getCell(10).value = emp.position || cfg.default_position;
        row.getCell(11).value = emp.contract_start || '';
        row.getCell(12).value = cfg.salary_mensual;
        row.getCell(13).value = cfg.salary_dia;
        for (let d = 0; d < Math.min(numDays, maxDaySlots); d++) {
          try { row.getCell(COL_N + d).value = progToCode(empMarks?.get(fmt(periodDays[d])), periodDays[d]) || null; } catch {}
        }
        const sw = (col: number | undefined, val: any) => { if (!col) return; try { row.getCell(col).value = val; } catch {} };
        sw(calcColMap.dias,         dias    || null);
        sw(calcColMap.doms,         doms    || null);
        sw(calcColMap.totalDoms,    doms    ? parseFloat((doms * cfg.salary_dom).toFixed(2))    : null);
        sw(calcColMap.incap,        incap   || null);
        sw(calcColMap.totalIncap,   incap   ? parseFloat((incap * cfg.salary_dia).toFixed(2))   : null);
        sw(calcColMap.permiso,      permiso || null);
        sw(calcColMap.totalPermiso, permiso ? parseFloat((permiso * cfg.salary_dia).toFixed(2)) : null);
        sw(calcColMap.feriado,      fer     || null);
        sw(calcColMap.totalFeriado, fer     ? parseFloat((fer * cfg.salary_dia).toFixed(2))     : null);
        sw(calcColMap.bruto,        bruto   || null);
        sw(calcColMap.css,          css     || null);
        sw(calcColMap.neto,         neto    || null);
        row.getCell(50).value = null; row.getCell(51).value = null; row.getCell(52).value = null;
        row.commit();
        hoja2Rows.push({ emp, neto });
      }
      rowOffset += empList.length;
    }

    const maxTemplateRow = half === '1' ? 84 : 92;
    for (let rowIdx = DATA_START + rowOffset; rowIdx <= maxTemplateRow; rowIdx++) {
      const row = wsPsmt.getRow(rowIdx);
      for (let c = 1; c <= 52; c++) {
        try { const cell = row.getCell(c); if (!(cell as any).formula) { cell.value = null; cell.fill = { type: 'pattern', pattern: 'none' }; } } catch {}
      }
      row.commit();
    }

    const wsHoja2 = wb.getWorksheet('Hoja2');
    if (wsHoja2) {
      const H2_START = 5, H2_MAX = 79;
      for (let i = 0; i < hoja2Rows.length && i < H2_MAX - H2_START + 1; i++) {
        const { emp, neto } = hoja2Rows[i];
        const row2 = wsHoja2.getRow(H2_START + i);
        row2.getCell(2).value = emp.banco || '';
        row2.getCell(3).value = emp.cuenta_bancaria || '';
        row2.getCell(4).value = emp.full_name;
        row2.getCell(5).value = neto;
        row2.commit();
      }
      for (let rowIdx = H2_START + hoja2Rows.length; rowIdx <= H2_MAX; rowIdx++) {
        const row2 = wsHoja2.getRow(rowIdx);
        for (let c = 2; c <= 5; c++) row2.getCell(c).value = null;
        row2.commit();
      }
    }

    addSinMatchSheetGS(wb, unmatchedDB);

    const clubSuffix = singleClubId
      ? (configuredCfgs[0]?.name as string || singleClubId).replace(/\s+/g, '_').toUpperCase()
      : 'GLOBAL';
    const filename = `PSMT_GS_${clubSuffix}_${periodoShort.replace(/ /g, '_')}_${monthNameEs}_${y}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();

  } catch (error: any) {
    console.error('Error generando PSMT desde Google Sheets:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Error al generar la planilla PSMT' });
    }
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── Employee Portal ──────────────────────────────────────────────────────────

const isEmployee = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'Empleado') {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  next();
};

// GET /api/employee/me — employee's profile + documents + required types
router.get('/employee/me', isAuthenticated, isEmployee, async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, cedula, position, contract_type, contract_end, photo_url, club_id, clubs(name)')
      .eq('user_id', user.id)
      .eq('status', 'activo')
      .single();

    if (empError || !employee) {
      return res.status(404).json({ error: 'Perfil de empleado no encontrado.' });
    }

    const [{ data: documents }, { data: docTypes }] = await Promise.all([
      supabase
        .from('employee_documents')
        .select('id, document_type_id, file_name, expiry_date, status, uploaded_at, document_types(id, name, has_expiry)')
        .eq('employee_id', employee.id)
        .eq('is_current', 1)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('document_types')
        .select('id, name, has_expiry, is_required')
        .eq('is_active', 1)
        .eq('is_required', 1)
        .order('sort_order'),
    ]);

    res.json({ employee, documents: documents || [], required_types: docTypes || [] });
  } catch (error: any) {
    console.error('[employee/me]', error);
    res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
});

// POST /api/employee/documents/upload — employee uploads their own document
router.post('/employee/documents/upload', isAuthenticated, isEmployee, upload.single('file'), async (req, res) => {
  const user = (req as any).user;
  const { document_type_id, expiry_date } = req.body;
  const file = (req as any).file;

  if (!file) return res.status(400).json({ error: 'Archivo requerido.' });
  if (!document_type_id) return res.status(400).json({ error: 'Tipo de documento requerido.' });

  try {
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (empError || !employee) return res.status(404).json({ error: 'Perfil de empleado no encontrado.' });

    const docId = crypto.randomUUID();
    const fileExt = file.originalname.split('.').pop()?.toLowerCase();
    const filePath = `${employee.id}/${docId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) throw new Error(`Error al subir archivo: ${uploadError.message}`);

    // Mark previous version as not current
    await supabase
      .from('employee_documents')
      .update({ is_current: 0 })
      .eq('employee_id', employee.id)
      .eq('document_type_id', document_type_id)
      .eq('is_current', 1);

    const { data: latest } = await supabase
      .from('employee_documents')
      .select('version')
      .eq('employee_id', employee.id)
      .eq('document_type_id', document_type_id)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const { error: insertError } = await supabase.from('employee_documents').insert({
      id: docId,
      employee_id: employee.id,
      document_type_id,
      file_url: filePath,
      file_name: file.originalname,
      file_size_kb: Math.round(file.size / 1024),
      expiry_date: expiry_date || null,
      status: 'pendiente',
      version: (latest?.version || 0) + 1,
      is_current: 1,
      uploaded_by: user.id,
    });

    if (insertError) throw insertError;

    res.json({ success: true, document_id: docId });
  } catch (error: any) {
    console.error('[employee/documents/upload]', error);
    res.status(500).json({ error: error.message || 'Error al subir el documento.' });
  }
});

// POST /api/admin/employees/:id/create-access — admin creates employee portal account
router.post('/admin/employees/:id/create-access', isAuthenticated, isAdmin, async (req, res) => {
  const { id: employeeId } = req.params;
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos.' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

  try {
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, user_id')
      .eq('id', employeeId)
      .single();

    if (empError || !employee) return res.status(404).json({ error: 'Empleado no encontrado.' });
    if (employee.user_id) return res.status(409).json({ error: 'Este empleado ya tiene acceso al portal.' });

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) return res.status(409).json({ error: 'El email ya está registrado.' });

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    const { error: userError } = await supabase.from('users').insert({
      id: userId,
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      name: employee.full_name,
      role: 'Empleado',
      is_active: 1,
    });
    if (userError) throw userError;

    const { error: linkError } = await supabase
      .from('employees')
      .update({ user_id: userId })
      .eq('id', employeeId);
    if (linkError) throw linkError;

    res.json({ success: true });
  } catch (error: any) {
    console.error('[admin/employees/create-access]', error);
    res.status(500).json({ error: 'Error al crear el acceso.' });
  }
});

// DELETE /api/admin/employees/:id/remove-access
router.delete('/admin/employees/:id/remove-access', isAuthenticated, isAdmin, async (req, res) => {
  const { id: employeeId } = req.params;
  try {
    const { data: employee } = await supabase
      .from('employees')
      .select('id, user_id')
      .eq('id', employeeId)
      .single();

    if (!employee?.user_id) return res.status(404).json({ error: 'Este empleado no tiene acceso al portal.' });

    await supabase.from('employees').update({ user_id: null }).eq('id', employeeId);
    await supabase.from('users').update({ is_active: 0 }).eq('id', employee.user_id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar el acceso.' });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

export default router;

