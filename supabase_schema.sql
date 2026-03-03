-- Create tables
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  address TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  club_id TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (club_id) REFERENCES clubs (id)
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  cedula TEXT NOT NULL UNIQUE,
  position TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  contract_start DATE NOT NULL,
  contract_end DATE,
  status TEXT DEFAULT 'activo',
  photo_url TEXT,
  notes TEXT,
  termination_reason TEXT,
  termination_date DATE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (club_id) REFERENCES clubs (id),
  FOREIGN KEY (created_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS document_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  has_expiry INTEGER DEFAULT 0,
  is_required INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  document_type_id TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_kb INTEGER NOT NULL,
  expiry_date DATE,
  status TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  is_current INTEGER DEFAULT 1,
  uploaded_by TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees (id),
  FOREIGN KEY (document_type_id) REFERENCES document_types (id),
  FOREIGN KEY (uploaded_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees (id)
);

CREATE TABLE IF NOT EXISTS attendance_requests (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  date DATE NOT NULL,
  requested_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_id, date),
  FOREIGN KEY (club_id) REFERENCES clubs (id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  club_id TEXT,
  old_value TEXT,
  new_value TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_recipients (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (club_id) REFERENCES clubs (id)
);

-- Insert default data
INSERT INTO clubs (id, name, description) VALUES 
('club-david', 'David', 'Club David'),
('club-costa-verde', 'Costa Verde', 'Club Costa Verde'),
('club-metropark', 'Metropark', 'Club Metropark')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, password_hash, name, role) VALUES 
('admin-1', 'admin@psmt.com', 'admin123', 'Admin General', 'Administrador'),
('super-1', 'super@psmt.com', 'super123', 'Supervisora', 'Supervisora')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, password_hash, name, role, club_id) VALUES 
('coord-1', 'coord.david@psmt.com', 'coord123', 'Coordinadora David', 'Coordinadora', 'club-david')
ON CONFLICT (id) DO NOTHING;

INSERT INTO document_types (id, name, description, has_expiry, is_required, sort_order) VALUES 
('doc-1', 'Contrato firmado', 'Contrato laboral con firma original', 1, 1, 1),
('doc-2', 'Contrato sellado', 'Copia del contrato con sello oficial', 1, 1, 2),
('doc-3', 'Carnet blanco', 'Carnet de identificación interno', 1, 1, 3),
('doc-4', 'Carnet verde', 'Carnet de acreditación', 1, 1, 4),
('doc-5', 'Cédula', 'Copia legible de la cédula', 0, 1, 5),
('doc-6', 'Afiliación CSS', 'Documento de afiliación activa', 0, 1, 6),
('doc-7', 'Solicitud de entrada al club', 'Formulario interno', 0, 1, 7),
('doc-8', 'Carta de ingreso', 'Carta oficial de ingreso', 0, 1, 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO alert_recipients (id, club_id, email) VALUES 
('ar-1', 'club-david', 'gerente.david@psmt.com'),
('ar-2', 'club-david', 'rrhh.david@psmt.com'),
('ar-3', 'club-costa-verde', 'gerente.costaverde@psmt.com'),
('ar-4', 'club-metropark', 'gerente.metropark@psmt.com'),
('ar-5', 'club-metropark', 'rrhh.metropark@psmt.com')
ON CONFLICT (id) DO NOTHING;
