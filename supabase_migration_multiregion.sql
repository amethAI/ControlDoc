-- ============================================================
-- ControlDoc — Multi-Region Migration
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Propósito: parametrizar todo lo que estaba hardcodeado para Panamá
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. COLUMNAS DE CONFIG REGIONAL EN clubs
-- ────────────────────────────────────────────────────────────
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS country          TEXT    NOT NULL DEFAULT 'Panama';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS country_code     TEXT    NOT NULL DEFAULT 'PA';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS timezone         TEXT    NOT NULL DEFAULT 'America/Panama';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS locale           TEXT    NOT NULL DEFAULT 'es-PA';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS currency         TEXT    NOT NULL DEFAULT 'PAB';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kronos_prefix    TEXT    NOT NULL DEFAULT 'PA';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS salary_mensual   NUMERIC          DEFAULT 657.28;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS salary_dia       NUMERIC          DEFAULT 25.28;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS salary_dom       NUMERIC          DEFAULT 33.18;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS css_rate         NUMERIC          DEFAULT 0.11;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS default_position TEXT             DEFAULT 'DEMOSTRADORA';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS sheet_name       TEXT             DEFAULT 'PRICESMART ';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS sort_order       INTEGER          DEFAULT 99;

-- Poblar los tres clubes panameños existentes con sus valores correctos
UPDATE clubs SET
  country          = 'Panama',
  country_code     = 'PA',
  timezone         = 'America/Panama',
  locale           = 'es-PA',
  currency         = 'PAB',
  kronos_prefix    = 'PA',
  salary_mensual   = 657.28,
  salary_dia       = 25.28,
  salary_dom       = 33.18,
  css_rate         = 0.11,
  default_position = 'DEMOSTRADORA',
  sheet_name       = 'PRICESMART ',
  sort_order       = CASE id
    WHEN 'club-david'       THEN 1
    WHEN 'club-costa-verde' THEN 2
    WHEN 'club-metropark'   THEN 3
    ELSE 99
  END
WHERE id IN ('club-david', 'club-costa-verde', 'club-metropark');

-- ────────────────────────────────────────────────────────────
-- 2. CEDULA — scoping por país en vez de UNIQUE global
-- ────────────────────────────────────────────────────────────

-- Agregar country_code a employees para anclar la unicidad sin JOIN
ALTER TABLE employees ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'PA';

-- Función que sincroniza country_code desde el club al insertar/mover empleado
CREATE OR REPLACE FUNCTION sync_employee_country_code()
RETURNS TRIGGER AS $$
BEGIN
  SELECT country_code INTO NEW.country_code
  FROM clubs WHERE id = NEW.club_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: se ejecuta BEFORE INSERT OR UPDATE cuando cambia club_id
DROP TRIGGER IF EXISTS trg_sync_employee_country_code ON employees;
CREATE TRIGGER trg_sync_employee_country_code
  BEFORE INSERT OR UPDATE OF club_id ON employees
  FOR EACH ROW EXECUTE FUNCTION sync_employee_country_code();

-- Backfill de empleados existentes (todos son panameños hoy)
UPDATE employees SET country_code = 'PA';

-- Eliminar el UNIQUE global en cedula y reemplazar por UNIQUE(country_code, cedula)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_cedula_key;
DROP INDEX IF EXISTS employees_cedula_key;
DROP INDEX IF EXISTS uq_employees_cedula_country;
CREATE UNIQUE INDEX uq_employees_cedula_country ON employees(country_code, cedula);

-- ────────────────────────────────────────────────────────────
-- 3. ÍNDICE para lookups rápidos por país en clubs
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clubs_country      ON clubs(country);
CREATE INDEX IF NOT EXISTS idx_clubs_sort_order   ON clubs(sort_order);
CREATE INDEX IF NOT EXISTS idx_employees_country  ON employees(country_code);
