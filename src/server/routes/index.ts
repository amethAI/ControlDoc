import { Router } from 'express';
import { supabase } from '../db.js';
import { sendExpirationAlerts } from '../services/alertService.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import archiver from 'archiver';

const router = Router();

// Middleware to check if user is Administrator
const isAdmin = (req: any, res: any, next: any) => {
  const role = req.headers['x-user-role'];
  if (role !== 'Administrador') {
    return res.status(403).json({ error: 'Acceso denegado. Solo el administrador puede realizar esta acción.' });
  }
  next();
};

// Helper to log audit actions
const logAudit = async (
  userId: string,
  userName: string,
  actionType: string,
  actionDescription: string,
  entityType: string,
  entityId: string | null,
  entityName: string | null,
  clubId: string | null,
  req: any
) => {
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
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

// Simple mock auth
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(`Intentando login para: ${email}`);
  
  // Hardcoded check for debugging
  if (email === 'admin@psmt.com' && password === 'admin123') {
    console.log(`Login exitoso (hardcoded) para: ${email}`);
    return res.json({
      token: `mock-jwt-admin-1`,
      user: {
        id: 'admin-1',
        email: 'admin@psmt.com',
        name: 'Admin General',
        role: 'Administrador',
        club_id: null
      }
    });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('password_hash', password)
      .single();
    
    if (user && !error) {
      console.log(`Login exitoso para: ${email}`);
      // In a real app, use JWT. Here we just return user details.
      res.json({
        token: `mock-jwt-${user.id}`,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          club_id: user.club_id
        }
      });
    } else {
      console.log(`Login fallido para: ${email} (Credenciales inválidas)`);
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (error) {
    console.error('Error en el proceso de login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get all clubs
router.get('/clubs', async (req, res) => {
  const { data: clubs, error } = await supabase.from('clubs').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(clubs ? clubs.filter(c => c.id !== 'global') : []);
});

// Get single club
router.get('/clubs/:id', async (req, res) => {
  const { data: club, error } = await supabase.from('clubs').select('*').eq('id', req.params.id).single();
  if (club) {
    res.json(club);
  } else {
    res.status(404).json({ error: 'Club no encontrado' });
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
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;
    await logAudit(
      userId, userName,
      'Creación de club',
      `Club creado: ${name}`,
      'Club', id, name, id, req
    );
    
    res.status(201).json(newClub);
  } catch (error: any) {
    console.error('Error creating club:', error);
    res.status(500).json({ error: 'Error al crear club' });
  }
});

// Get employees
router.get('/employees', async (req, res) => {
  const { club_id, status } = req.query;
  
  let query = supabase.from('employees').select('*');
  
  if (club_id) {
    query = query.eq('club_id', club_id);
  }

  if (status) {
    query = query.eq('status', status);
  }
  
  const { data: employees, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(employees);
});

// Create employee
router.post('/employees', isAdmin, async (req, res) => {
  const { full_name, cedula, position, contract_type, contract_start, club_id } = req.body;
  
  try {
    const id = `emp-${Date.now()}`;
    const { data: newEmployee, error } = await supabase
      .from('employees')
      .insert([{ 
        id, full_name, cedula, position, contract_type, contract_start, club_id, status: 'activo' 
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
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;
    await logAudit(
      userId, userName,
      'Creación de empleado',
      `Empleado creado: ${full_name} (${cedula})`,
      'Empleado', id, full_name, club_id, req
    );
    
    res.status(201).json(newEmployee);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear empleado' });
  }
});

// Get single employee
router.get('/employees/:id', async (req, res) => {
  const { data: employee, error } = await supabase.from('employees').select('*').eq('id', req.params.id).single();
  if (employee) {
    res.json(employee);
  } else {
    res.status(404).json({ error: 'Empleado no encontrado' });
  }
});

// Get document types
router.get('/document-types', async (req, res) => {
  const { data: types, error } = await supabase.from('document_types').select('*').eq('is_active', 1).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(types);
});

// Get employee documents
router.get('/employees/:id/documents', async (req, res) => {
  const { data: documents, error } = await supabase
    .from('employee_documents')
    .select('*')
    .eq('employee_id', req.params.id)
    .eq('is_current', 1);
    
  if (error) return res.status(500).json({ error: error.message });
  res.json(documents);
});

// Create document (upload)
router.post('/documents', isAdmin, async (req, res) => {
  const { employee_id, document_type_id, file_name, expiry_date, status } = req.body;
  
  try {
    const id = `doc-${Date.now()}`;
    
    // Mark previous versions as not current
    await supabase
      .from('employee_documents')
      .update({ is_current: 0 })
      .eq('employee_id', employee_id)
      .eq('document_type_id', document_type_id);
    
    // Mock file_url and file_size_kb
    const { data: newDoc, error } = await supabase
      .from('employee_documents')
      .insert([{
        id, employee_id, document_type_id, file_url: `/uploads/${file_name}`, file_name, file_size_kb: 1024, expiry_date, status
      }])
      .select()
      .single();
      
    if (error) throw error;
    
    // Log audit
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;
    await logAudit(
      userId, userName,
      'Carga de documento',
      `Documento subido: ${file_name}`,
      'Documento', id, file_name, null, req
    );
    
    res.status(201).json(newDoc);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Error al subir documento' });
  }
});

// Update document (e.g., expiry date)
router.patch('/documents/:id', async (req, res) => {
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

// Terminate employee
router.patch('/employees/:id/terminate', async (req, res) => {
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
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;
    await logAudit(
      userId, userName,
      'Baja de empleado',
      `Empleado dado de baja: ID ${req.params.id}`,
      'Empleado', req.params.id, null, updatedEmployee.club_id, req
    );

    res.json(updatedEmployee);
  } catch (error) {
    console.error('Error terminating employee:', error);
    res.status(500).json({ error: 'Error al dar de baja al empleado' });
  }
});

// Reactivate employee
router.patch('/employees/:id/reactivate', async (req, res) => {
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
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;
    await logAudit(
      userId, userName,
      'Reactivación de empleado',
      `Empleado reactivado: ID ${req.params.id}`,
      'Empleado', req.params.id, null, updatedEmployee.club_id, req
    );

    res.json(updatedEmployee);
  } catch (error) {
    console.error('Error reactivating employee:', error);
    res.status(500).json({ error: 'Error al reactivar al empleado' });
  }
});

// Attendance routes
router.get('/attendance', async (req, res) => {
  const { club_id, start_date, end_date } = req.query;
  
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

router.post('/attendance', async (req, res) => {
  const { records } = req.body; // Array of { employee_id, date, status }
  
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
router.get('/attendance-requests', async (req, res) => {
  const { club_id, start_date, end_date } = req.query;
  
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

router.post('/attendance-requests', async (req, res) => {
  const { records } = req.body; // Array of { club_id, date, requested_count }
  
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

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
  const { club_id } = req.query;
  
  try {
    // 1. Total Employees
    let empQuery = supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'activo');
    if (club_id) empQuery = empQuery.eq('club_id', club_id);
    const { count: totalEmployees } = await empQuery;

    // 2. Expired Documents
    let expiredQuery = supabase.from('employee_documents').select('id', { count: 'exact', head: true })
      .eq('is_current', 1)
      .eq('status', 'vencido');
    
    if (club_id) {
      // Need to join with employees to filter by club_id
      const { data: expiredDocs } = await supabase
        .from('employee_documents')
        .select('id, employees!inner(club_id)')
        .eq('is_current', 1)
        .eq('status', 'vencido')
        .eq('employees.club_id', club_id);
      var expiredDocuments = expiredDocs?.length || 0;
    } else {
      const { count } = await expiredQuery;
      var expiredDocuments = count || 0;
    }

    // 3. Expiring Soon
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const dateStr = thirtyDaysFromNow.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    
    let expiringQuery = supabase.from('employee_documents').select('id', { count: 'exact', head: true })
      .eq('is_current', 1)
      .gte('expiry_date', todayStr)
      .lte('expiry_date', dateStr);
      
    if (club_id) {
      const { data: expiringDocs } = await supabase
        .from('employee_documents')
        .select('id, employees!inner(club_id)')
        .eq('is_current', 1)
        .gte('expiry_date', todayStr)
        .lte('expiry_date', dateStr)
        .eq('employees.club_id', club_id);
      var expiringSoonDocuments = expiringDocs?.length || 0;
    } else {
      const { count } = await expiringQuery;
      var expiringSoonDocuments = count || 0;
    }

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

    res.json({
      totalEmployees: totalEmployees || 0,
      expiredDocuments,
      expiringSoonDocuments,
      incompleteEmployees,
      documentsUploadedToday,
      clubDistribution
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// User management routes
router.get('/users', isAdmin, async (req, res) => {
  const { data: users, error } = await supabase.from('users').select('id, email, password_hash as password, name, role, club_id, is_active');
  if (error) return res.status(500).json({ error: error.message });
  res.json(users);
});

router.post('/users', isAdmin, async (req, res) => {
  const { email, password, name, role, club_id } = req.body;
  try {
    const id = `user-${Date.now()}`;
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ id, email, password_hash: password, name, role, club_id: club_id || null }])
      .select('id, email, name, role, club_id, is_active')
      .single();
      
    if (error) throw error;
    
    // Log audit
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;
    await logAudit(
      userId, userName,
      'Creación de usuario',
      `Usuario creado: ${name} (${email})`,
      'Usuario', id, name, club_id, req
    );
    
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

router.patch('/users/:id', isAdmin, async (req, res) => {
  const { email, password, name, role, club_id, is_active } = req.body;
  try {
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ 
        email, 
        password_hash: password, 
        name, 
        role, 
        club_id: club_id || null, 
        is_active: is_active === undefined ? 1 : is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select('id, email, name, role, club_id, is_active')
      .single();
      
    if (error) throw error;
    
    // Log audit
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;
    await logAudit(
      userId, userName,
      'Actualización de usuario',
      `Usuario actualizado: ${name} (${email})`,
      'Usuario', req.params.id, name, club_id, req
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
    const reqUserId = req.headers['x-user-id'] as string;
    const reqUserName = req.headers['x-user-name'] as string;
    await logAudit(
      reqUserId, reqUserName,
      'Eliminación de usuario',
      `Usuario eliminado: ID ${userId}`,
      'Usuario', userId, null, null, req
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario: ' + error.message });
  }
});

// Alert recipients routes
router.get('/alert-recipients', async (req, res) => {
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
      .select('full_name, cedula, position, status, contract_type, contract_start, clubs(name)');

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

// Download Source Code
router.get('/download-source', (req, res) => {
  try {
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    res.attachment(`psmt-source-code-${new Date().toISOString().split('T')[0]}.zip`);

    archive.on('error', function(err) {
      res.status(500).send({error: err.message});
    });

    archive.pipe(res);

    archive.glob('**/*', {
      cwd: process.cwd(),
      ignore: ['node_modules/**', 'dist/**', '.git/**', '.env', '.env.*', '*.zip']
    });

    archive.finalize();
  } catch (error) {
    console.error('Error creating zip:', error);
    res.status(500).json({ error: 'Error al generar el archivo ZIP' });
  }
});

export default router;

