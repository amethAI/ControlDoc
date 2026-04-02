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

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
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
      .select('id, email, name, role, club_id')
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

// Middleware to check if user is Administrator
const isAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'Administrador') {
    return res.status(403).json({ error: 'Acceso denegado. Solo el administrador puede realizar esta acción.' });
  }
  next();
};

// Middleware to check if user can view data (Employees, Attendance, Dashboard)
const canViewData = (req: any, res: any, next: any) => {
  const allowedRoles = ['Administrador', 'Supervisor Interno', 'Supervisora', 'Coordinadora', 'Supervisor Cliente'];
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
  const allowedRoles = ['Administrador', 'Supervisor Interno'];
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
  const internalRoles = ['Administrador', 'Supervisor Interno'];
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

// Performance Routes
router.get('/performance', isAuthenticated, isInternal, async (req, res) => {
  const { date, club_id: queryClubId } = req.query;
  const user = (req as any).user;
  
  // If user is Supervisor Interno, they can only see their club
  const club_id = user.role === 'Supervisor Interno' ? user.club_id : queryClubId;
  
  try {
    let query = supabase
      .from('daily_performance')
      .select(`
        *,
        employee:employees(id, name)
      `);
    
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
    const { data, error } = await supabase
      .from('daily_performance')
      .upsert(records.map((r: any) => ({
        ...r,
        created_by: user.id,
        updated_at: new Date().toISOString()
      })));
    
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
      bcrypt.compareSync(password, user.password_hash);
    
    if (user && isValidPassword) {
      console.log(`Login exitoso para: ${email}`);

      // Generate JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role, club_id: user.club_id },
        JWT_SECRET,
        { expiresIn: '24h' }
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
          club_id: user.club_id
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

// Temporary: list available Gemini models (public for diagnostics)
router.get('/ai/models', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.json({ error: 'No GEMINI_API_KEY configured' });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    res.json({ error: e.message });
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
    console.log(`[API] /clubs called by ${user?.email} (Role: ${user?.role}, Club: ${user?.club_id})`);
    const { data: clubs, error } = await supabase.from('clubs').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(clubs ? clubs.filter(c => c.id !== 'global') : []);
  } catch (error: any) {
    console.error('Error in /clubs:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get single club
router.get('/clubs/:id', isAuthenticated, async (req, res) => {
  try {
    const { data: club, error } = await supabase.from('clubs').select('*').eq('id', req.params.id).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    if (club) {
      res.json(club);
    } else {
      res.status(404).json({ error: 'Club no encontrado' });
    }
  } catch (error: any) {
    console.error('Error in /clubs/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Create club
router.post('/clubs', isAdmin, async (req, res) => {
  const { name, description, address } = req.body;
  
  try {
    const id = `club-${Date.now()}`;
    const { data: newClub, error } = await supabase
      .from('clubs')
      .insert([{ id, name, description, address }])
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
    
    // If user is Supervisor Interno or Coordinadora, they can only see their club
    const club_id = (user.role === 'Supervisor Interno' || user.role === 'Coordinadora') ? user.club_id : queryClubId;
    
    // Debug check
    const isMock = !process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY;
    if (isMock) {
      console.warn('⚠️ API /employees called but Supabase is NOT configured. Using mock data or returning empty.');
    }
    
    let query = supabase.from('employees').select('*').order('full_name', { ascending: true });
    
    if (club_id) {
      query = query.eq('club_id', club_id);
    }

    if (status) {
      query = query.eq('status', status);
    }
    
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
  const { full_name, cedula, position, contract_type, contract_start, contract_end, club_id } = req.body;
  const user = (req as any).user;

  // Restriction: Supervisor Interno can only create for their club
  if (user.role === 'Supervisor Interno' && club_id !== user.club_id) {
    return res.status(403).json({ error: 'Acceso denegado. Solo puede crear empleados para su club asignado.' });
  }
  
  try {
    const id = `emp-${Date.now()}`;
    const { data: newEmployee, error } = await supabase
      .from('employees')
      .insert([{ 
        id, full_name, cedula, position, contract_type, contract_start, contract_end, club_id, status: 'activo' 
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

// Get single employee
router.get('/employees/:id', isAuthenticated, async (req, res) => {
  try {
    const { data: employee, error } = await supabase.from('employees').select('*').eq('id', req.params.id).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    if (employee) {
      res.json(employee);
    } else {
      res.status(404).json({ error: 'Empleado no encontrado' });
    }
  } catch (error: any) {
    console.error('Error in /employees/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get document types
router.get('/document-types', async (req, res) => {
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
  try {
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
      return res.status(500).json({ error: `Error desconocido: ${err.message}` });
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
    
    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === 'documents')) {
      await supabase.storage.createBucket('documents', { public: true });
    }
    
    // Ensure bucket exists or just upload (Supabase will fail if bucket doesn't exist, 
    // but we assume it's created or we can try to create it)
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

    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);
      
    const file_url = publicUrlData.publicUrl;
    
    // Handle the special 'doc-personal-combined' type
    if (document_type_id === 'doc-personal-combined') {
      // Mark previous versions as not current for all related types
      await supabase
        .from('employee_documents')
        .update({ is_current: 0 })
        .eq('employee_id', employee_id)
        .in('document_type_id', ['doc-3', 'doc-4', 'doc-5']); // Carnet blanco, Carnet verde, Cédula

      // Insert document records for each type
      const docsToInsert = [
        { id: `doc-${Date.now()}-1`, employee_id, document_type_id: 'doc-3', file_url, file_name, file_size_kb, expiry_date: expiry_date || null, status }, // Carnet blanco
        { id: `doc-${Date.now()}-2`, employee_id, document_type_id: 'doc-4', file_url, file_name, file_size_kb, expiry_date: expiry_date || null, status }, // Carnet verde
        { id: `doc-${Date.now()}-3`, employee_id, document_type_id: 'doc-5', file_url, file_name, file_size_kb, expiry_date: null, status: 'sin_fecha' } // Cédula (no expiry)
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
    await supabase
      .from('employee_documents')
      .update({ is_current: 0 })
      .eq('employee_id', employee_id)
      .eq('document_type_id', document_type_id);
    
    // Insert document record
    const { data: newDoc, error } = await supabase
      .from('employee_documents')
      .insert([{
        id, employee_id, document_type_id, file_url, file_name, file_size_kb, expiry_date: expiry_date || null, status
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
      
    const contractTiedDocTypeIds = docTypes
      ?.filter(dt => ['Afiliación CSS', 'Contrato firmado', 'Solicitud de entrada al club', 'Aviso de entrada'].some(name => dt.name.includes(name)))
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
          
        // Update all contract-tied documents for this employee
        if (contractTiedDocTypeIds.length > 0 && ('contract_end' in updateData)) {
          await supabase
            .from('employee_documents')
            .update({ expiry_date: updateData.contract_end })
            .eq('employee_id', employee.id)
            .in('document_type_id', contractTiedDocTypeIds)
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

// Get expiring documents
router.get('/documents/expirations', canViewData, async (req, res) => {
  const { club_id: queryClubId, status } = req.query;
  const user = (req as any).user;
  
  // If user is Supervisor Interno or Coordinadora, they can only see their club
  const club_id = (user.role === 'Supervisor Interno' || user.role === 'Coordinadora') ? user.club_id : queryClubId;
  
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

    if (club_id) {
      query = query.eq('employees.club_id', club_id);
    }

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
  
  const club_id = (user.role === 'Supervisor Interno' || user.role === 'Coordinadora') ? user.club_id : queryClubId;
  console.log(`[API] /reports/checklist called by ${user?.email} (Role: ${user?.role}, UserClub: ${user?.club_id}, QueryClub: ${queryClubId}, FinalClub: ${club_id})`);
  
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

// Get dashboard stats
router.get('/dashboard', canViewData, async (req, res) => {
  const { club_id: queryClubId } = req.query;
  const user = (req as any).user;
  
  // If user is Supervisor Interno or Coordinadora, they can only see their club
  const club_id = (user.role === 'Supervisor Interno' || user.role === 'Coordinadora') ? user.club_id : queryClubId;
  
  try {
    // 1. Total Employees
    let empQuery = supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'activo');
    if (club_id) empQuery = empQuery.eq('club_id', club_id);
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
      
    if (club_id) expiredDocsQuery = expiredDocsQuery.eq('employees.club_id', club_id);
    
    const { data: expiredDocsData } = await expiredDocsQuery;
    
    // Fetch expired contracts
    let expiredContractsQuery = supabase
      .from('employees')
      .select('id, full_name, contract_end, contract_type')
      .eq('status', 'activo')
      .not('contract_end', 'is', null)
      .lt('contract_end', todayStr);
      
    if (club_id) expiredContractsQuery = expiredContractsQuery.eq('club_id', club_id);
    
    const { data: expiredContractsData } = await expiredContractsQuery;
    
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
        employee_name: (d.employees as any).full_name,
        type: (d.document_types as any).name,
        date: d.expiry_date,
        status: 'expired'
      })),
      ...(expiredContractsData || [])
        .filter(e => e.contract_type?.toLowerCase() !== 'indefinido')
        .map(e => ({
        id: `contract-${e.id}`,
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
      
    if (club_id) expiringDocsQuery = expiringDocsQuery.eq('employees.club_id', club_id);
    
    const { data: expiringDocsData } = await expiringDocsQuery;
    
    // Fetch expiring contracts
    let expiringContractsQuery = supabase
      .from('employees')
      .select('id, full_name, contract_end, contract_type')
      .eq('status', 'activo')
      .gte('contract_end', todayStr)
      .lte('contract_end', dateStr);
      
    if (club_id) expiringContractsQuery = expiringContractsQuery.eq('club_id', club_id);
    
    const { data: expiringContractsData } = await expiringContractsQuery;
    
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
        employee_name: (d.employees as any).full_name,
        type: (d.document_types as any).name,
        date: d.expiry_date,
        status: 'expiring'
      })),
      ...(expiringContractsData || [])
        .filter(e => e.contract_type?.toLowerCase() !== 'indefinido')
        .map(e => ({
        id: `contract-${e.id}`,
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
    const { data: uploadedTodayDocs } = await supabase
      .from('employee_documents')
      .select('id, uploaded_at' + (club_id ? ', employees!inner(club_id)' : ''))
      .gte('uploaded_at', todayStr + 'T00:00:00.000Z');
      
    let documentsUploadedToday = 0;
    if (uploadedTodayDocs) {
      if (club_id) {
        documentsUploadedToday = uploadedTodayDocs.filter(d => (d as any).employees?.club_id === club_id).length;
      } else {
        documentsUploadedToday = uploadedTodayDocs.length;
      }
    }

    // 6. Club Distribution
    const { data: clubs } = await supabase.from('clubs').select('id, name').neq('id', 'global');
    const { data: activeEmployees } = await supabase.from('employees').select('club_id').eq('status', 'activo');
    
    const clubDistribution = clubs?.map(club => {
      const count = activeEmployees?.filter(e => e.club_id === club.id).length || 0;
      return { name: club.name, value: count };
    }) || [];

    // 7. Performance Stats (Internal Only)
    let performanceStats = null;
    const internalRoles = ['Administrador', 'Supervisor Interno'];
    const user = (req as any).user;
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

    res.json({
      totalEmployees: totalEmployees || 0,
      expiredDocuments,
      expiringSoonDocuments,
      incompleteEmployees,
      documentsUploadedToday,
      clubDistribution,
      performanceStats,
      expiredList,
      expiringList
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// User management routes
router.get('/users', isAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase.from('users').select('id, email, name, role, club_id, is_active');
    if (error) return res.status(500).json({ error: error.message });
    res.json(users);
  } catch (error: any) {
    console.error('Error in /users:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/users', isAdmin, async (req, res) => {
  const { email, password, name, role, club_id } = req.body;
  try {
    const id = `user-${Date.now()}`;
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ id, email, password_hash: hashedPassword, name, role, club_id: club_id || null }])
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
  const { email, password, name, role, club_id, is_active } = req.body;
  try {
    const updateData: any = {
      email, 
      name, 
      role, 
      club_id: club_id || null, 
      is_active: is_active === undefined ? 1 : is_active,
      updated_at: new Date().toISOString()
    };
    
    if (password) {
      updateData.password_hash = bcrypt.hashSync(password, 10);
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
router.get('/alert-recipients', async (req, res) => {
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

router.post('/alert-recipients', async (req, res) => {
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
router.post('/test-alert', async (req, res) => {
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
      model: 'gemini-3.0-flash-preview',
      contents: `${systemPrompt}\n\nPregunta: ${question}`,
    });

    const text = result.text || 'No se pudo generar una respuesta.';
    res.json({ response: text });
  } catch (error: any) {
    console.error('AI chat error:', error?.message || error);
    res.status(500).json({ error: `Error: ${error?.message || 'Error al procesar tu pregunta'}` });
  }
});

export default router;

