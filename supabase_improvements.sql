-- ============================================================
-- ControlDoc — Supabase Improvements
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ROW LEVEL SECURITY
-- Política: solo el service_role puede operar (el backend Express).
-- Bloquea cualquier acceso directo con anon key o user key.
-- ────────────────────────────────────────────────────────────

ALTER TABLE clubs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_recipients    ENABLE ROW LEVEL SECURITY;

-- Una política por tabla: solo service_role tiene acceso
CREATE POLICY "service_role_only" ON clubs               USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON users               USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON employees           USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON employee_documents  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON attendance          USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON attendance_requests USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON document_types      USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON audit_logs          USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON alert_recipients    USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- EMPLOYEE PORTAL — user_id link
-- Ejecutar una sola vez para habilitar el portal del empleado
-- ────────────────────────────────────────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);

-- ────────────────────────────────────────────────────────────
-- 2. ÍNDICES
-- ────────────────────────────────────────────────────────────

-- Empleados por club (carga de ClubDetail y filtros)
CREATE INDEX IF NOT EXISTS idx_employees_club_id
  ON employees(club_id);

-- Empleados por estado (filtros activo/inactivo)
CREATE INDEX IF NOT EXISTS idx_employees_status
  ON employees(status);

-- Empleados por club + estado (query combinada más común)
CREATE INDEX IF NOT EXISTS idx_employees_club_status
  ON employees(club_id, status);

-- Documentos por empleado (carga de EmployeeProfile)
CREATE INDEX IF NOT EXISTS idx_employee_docs_employee_id
  ON employee_documents(employee_id);

-- Documentos vigentes por empleado (is_current=1 es el caso más frecuente)
CREATE INDEX IF NOT EXISTS idx_employee_docs_current
  ON employee_documents(employee_id, is_current);

-- Documentos próximos a vencer (alertas de vencimiento)
CREATE INDEX IF NOT EXISTS idx_employee_docs_expiry
  ON employee_documents(expiry_date)
  WHERE expiry_date IS NOT NULL AND is_current = 1;

-- Asistencia por fecha (analytics y filtros de mes)
CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance(date);

-- Asistencia por empleado (historial en EmployeeProfile)
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id
  ON attendance(employee_id);

-- Audit logs por club (filtro en panel de auditoría)
CREATE INDEX IF NOT EXISTS idx_audit_logs_club_id
  ON audit_logs(club_id);

-- Audit logs por fecha (queries recientes)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at DESC);
