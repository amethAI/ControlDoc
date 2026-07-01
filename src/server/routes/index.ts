import { Router } from 'express';
import { supabase } from '../db.ts';
import { sendExpirationAlerts } from '../services/alertService.ts';
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
  role:     z.enum(['Super Administrador', 'Administrador', 'Supervisor Interno', 'Coordinadora', 'Supervisor Cliente', 'Recursos Humanos', 'Supervisora']),
  club_id:  z.string().optional().nullable(),
  country:  z.string().optional().nullable(),
});

const updateUserSchema = z.object({
  email:     z.string().email('Email inválido'),
  name:      z.string().min(2, 'Nombre requerido').max(100),
  role:      z.enum(['Super Administrador', 'Administrador', 'Supervisor Interno', 'Coordinadora', 'Supervisor Cliente', 'Recursos Humanos', 'Supervisora']),
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
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set.');
}
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to check if user is authenticated
const isAuthenticated = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Fetch latest user data from DB to ensure club_id is up to date
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, role, club_id, country')
      .eq('id', decoded.id)
      .single();
      
    if (user) {
      req.user = user;
    } else {
      req.user = decoded;
    }
    
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
  const allowedRoles = ['Super Administrador', 'Administrador', 'Supervisor Interno', 'Supervisora', 'Coordinadora', 'Supervisor Cliente', 'Recursos Humanos'];
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
  const allowedRoles = ['Super Administrador', 'Administrador', 'Supervisor Interno'];
  const user = (req as any).user;
  
  if (!user || !allowedRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. No tiene permisos para realizar modificaciones.' });
  }

  // Restriction: Supervisor Interno must have a club assigned
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
  // Recursos Humanos, Supervisor Cliente, Supervisora: read access allowed
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
  const COUNTRY_SCOPED_ROLES = ['Administrador', 'Recursos Humanos', 'Supervisor Cliente'];

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

// Simple auth endpoint
router.get('/auth/me', isAuthenticated, async (req, res) => {
  const user = (req as any).user;
  res.json({ user });
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
        { expiresIn: '8h' }
      );

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
        ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
      }).then(({ error }) => { if (error) console.error('Error logging login:', error); });

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
      console.warn(`[AUTH] Login fallido para: ${email} desde IP: ${req.headers['x-forwarded-for'] || req.socket?.remoteAddress}`);
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (error) {
    console.error('Error en el proceso de login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
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


// Get access logs (login history)
router.get('/access-logs', isAdmin, async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('id, created_at, user_name, entity_name, club_id, ip_address')
      .eq('action_type', 'Inicio de sesión')
      .order('created_at', { ascending: false })
      .limit(200);
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
    } else if (['Administrador', 'Recursos Humanos', 'Supervisor Cliente'].includes(user.role) && user.country) {
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
    const id = `club-${Date.now()}`;
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
    const id = `emp-${Date.now()}`;
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

  // Supervisors/Coordinadoras are always scoped to their own club
  const scopedRoles = ['Supervisor Interno', 'Coordinadora'];
  const club_id = scopedRoles.includes(user.role)
    ? user.club_id
    : (queryClubId as string | undefined);

  let query = supabase
    .from('employees')
    .select('id, full_name, birth_date, club_id')
    .eq('status', 'activo')
    .not('birth_date', 'is', null)
    .order('birth_date', { ascending: true });

  if (club_id) query = query.eq('club_id', club_id);

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

    await supabase.from('audit_logs').insert([{
      action_type: 'UPDATE',
      entity_type: 'Employee',
      entity_id: id,
      entity_name: updated.full_name,
      performed_by: user.id,
      performed_by_name: user.name,
    }]);

    res.json(updated);
  } catch (error: any) {
    console.error('Error in PATCH /employees/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get document types
router.get('/document-types', isAuthenticated, async (req, res) => {
  try {
    const { data: types, error } = await supabase.from('document_types').select('*').eq('is_active', 1).order('sort_order');
    if (error) return res.status(500).json({ error: error.message });
    
    // Filter out specific documents and rename others for the new requirement
    const processedTypes = types?.map(type => {
      // We want to hide these specific types as requested
      if (['Carnet verde', 'Carnet blanco', 'Cédula', 'Carta de ingreso'].includes(type.name)) {
        return null;
      }
      return type;
    }).filter(Boolean) || [];
    
    // Add a virtual "Documentos Personales" type that will represent the combined file
    processedTypes.unshift({
      id: 'doc-personal-combined',
      name: 'Documentos Personales',
      description: 'Archivo unificado con Cédula, Carnet Verde y Carnet Blanco',
      has_expiry: 1, // We need expiry to handle the alerts from the excel
      is_required: 1,
      is_active: 1,
      sort_order: 0
    });
    
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
      .select('*, document_types(id, name)')
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
    const id = `doc-${Date.now()}`;
    
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
      // Mark previous versions as not current for all related types
      const { error: updateCombinedError } = await supabase
        .from('employee_documents')
        .update({ is_current: 0 })
        .eq('employee_id', employee_id)
        .in('document_type_id', ['doc-3', 'doc-4', 'doc-5']); // Carnet blanco, Carnet verde, Cédula
      if (updateCombinedError) throw updateCombinedError;

      // Insert document records for each type — use same base ts with suffix to guarantee unique IDs
      const ts = Date.now();
      const docsToInsert = [
        { id: `doc-${ts}-1`, employee_id, document_type_id: 'doc-3', file_url, file_name, file_size_kb, expiry_date: expiry_date || null, status, is_current: 1 }, // Carnet blanco
        { id: `doc-${ts}-2`, employee_id, document_type_id: 'doc-4', file_url, file_name, file_size_kb, expiry_date: expiry_date || null, status, is_current: 1 }, // Carnet verde
        { id: `doc-${ts}-3`, employee_id, document_type_id: 'doc-5', file_url, file_name, file_size_kb, expiry_date: null, status: 'sin_fecha', is_current: 1 }  // Cédula (no expiry)
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
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Error al subir documento' });
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
      typeIdsToDelete = ['doc-3', 'doc-4', 'doc-5'];
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
      
      console.log('Processing record:', record);
      
      // Find employee by name (case-insensitive, trim spaces)
      const employee = employees.find(e => 
        e.full_name.toLowerCase().trim() === record.name.toLowerCase().trim()
      );

      if (!employee) {
        errorCount++;
        errors.push(`Empleado no encontrado: ${record.name}`);
        continue;
      }

      // Update Carnet Verde (doc-4)
      if (record.carnetVerde) {
        await supabase
          .from('employee_documents')
          .update({ expiry_date: record.carnetVerde })
          .eq('employee_id', employee.id)
          .eq('document_type_id', 'doc-4')
          .eq('is_current', 1);
      }

      // Update Carnet Blanco (doc-3)
      if (record.carnetBlanco) {
        await supabase
          .from('employee_documents')
          .update({ expiry_date: record.carnetBlanco })
          .eq('employee_id', employee.id)
          .eq('document_type_id', 'doc-3')
          .eq('is_current', 1);
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
              id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
  
  try {
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
  
  try {
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

router.post('/attendance', canModifyData, async (req, res) => {
  const { records } = req.body; // Array of { employee_id, date, status }
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
    const upsertData = records.map((record: any) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      employee_id: record.employee_id,
      date: record.date,
      status: record.status,
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('attendance')
      .upsert(upsertData, { onConflict: 'employee_id, date' });
      
    if (error) throw error;
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
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

    const { data: club, error: clubErr } = await supabase
      .from('clubs').select('name').eq('id', clubId).single();
    if (clubErr || !club) return res.status(404).json({ error: 'Club no encontrado' });

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

    const SALARIO_MENSUAL = 657.28;
    const SALARIO_DIA     = 25.28;
    const SALARIO_DOM     = 33.18;

    const { default: ExcelJS } = await import('exceljs');
    const templateFile = half === '1' ? 'psmt-1ra-q.xlsx' : 'psmt-2da-q.xlsx';
    const templatePath = path.join(process.cwd(), 'src', 'server', 'templates', templateFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    const ws = wb.getWorksheet('PRICESMART ');
    if (!ws) throw new Error('Sheet "PRICESMART " no encontrada en plantilla');

    const MONTHS_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const monthNameEs = MONTHS_ES[m];
    const periodoShort = half === '1' ? '1RA Q' : '2DA Q';
    ws.getRow(3).getCell(8).value = monthNameEs;
    ws.getRow(3).commit();
    ws.getRow(4).getCell(7).value = `PERIODO: ${periodoShort} ${monthNameEs} ${y}`;
    ws.getRow(4).getCell(8).value = periodoShort;
    ws.getRow(4).commit();
    (ws as any)._conditionalFormattings = [];

    const DATA_START_ROW = 9;
    const COL_N = 14; // column N = 14 (1-indexed)
    const MAX_DAY_COLS = 15;

    // Fill employee rows
    for (let i = 0; i < empList.length; i++) {
      const emp = empList[i] as any;
      const rowIdx = DATA_START_ROW + i;
      const row = ws.getRow(rowIdx);
      const kronos = emp.cedula ? 'PA' + emp.cedula.replace(/-/g, '') : '';

      row.getCell(1).value  = i + 1;
      row.getCell(2).value  = 'PANAMÁ';
      row.getCell(3).value  = emp.banco || '';
      row.getCell(4).value  = emp.cuenta_bancaria || '';
      row.getCell(5).value  = emp.cedula || '';
      row.getCell(6).value  = kronos;
      row.getCell(7).value  = emp.full_name;
      row.getCell(8).value  = 'PSMT ' + (club.name as string).toUpperCase();
      row.getCell(9).value  = 'Club ' + club.name;
      row.getCell(10).value = emp.position || 'DEMOSTRADORA';
      row.getCell(11).value = emp.contract_start || '';
      row.getCell(12).value = SALARIO_MENSUAL;
      row.getCell(13).value = SALARIO_DIA;

      for (let d = 0; d < periodDays.length && d < MAX_DAY_COLS; d++) {
        const day = periodDays[d];
        const dateStr = fmt(day);
        const code = toCode(attMap.get(`${emp.id}:${dateStr}`), day);
        row.getCell(COL_N + d).value = code || null;
      }
      row.commit();
    }

    // Clear data cells in unused rows (so sample data from template doesn't bleed through)
    const maxTemplateRow = half === '1' ? 84 : 92;
    for (let rowIdx = DATA_START_ROW + empList.length; rowIdx <= maxTemplateRow; rowIdx++) {
      const row = ws.getRow(rowIdx);
      for (let c = 1; c <= COL_N + MAX_DAY_COLS - 1; c++) {
        const cell = row.getCell(c);
        if (!(cell as any).formula) cell.value = null;
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
        const desc  = parseFloat((bruto * (0.0975 + 0.0125)).toFixed(2));
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
  const club_id = (user.role === 'Supervisor Interno' || user.role === 'Coordinadora') ? user.club_id : req.query.club_id;

  try {
    // Get all active employees
    let empQuery = supabase
      .from('employees')
      .select('id, full_name, cedula, position, club_id, clubs(name)')
      .eq('status', 'activo')
      .order('full_name', { ascending: true });

    if (club_id) empQuery = empQuery.eq('club_id', club_id);

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
        label: d.toLocaleDateString('es-PA', { month: 'short', year: '2-digit' }),
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
    const id = `user-${Date.now()}`;
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
        id: `ar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
// ─────────────────────────────────────────────────────────────────────────────

export default router;

