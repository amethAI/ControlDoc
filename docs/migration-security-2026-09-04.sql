-- ============================================================
-- Security Migration — 2026-09-04
-- ControlDoc — Correcciones detectadas en Auditoría Técnica
-- EJECUTAR EN: Supabase Dashboard > SQL Editor
-- ============================================================

-- ─── 1. RLS en tablas de dotación ────────────────────────────
-- Todas las tablas dotacion_* tienen RLS deshabilitado.
-- El backend usa service_role → RLS se bypasea de todos modos,
-- pero habilitarlo cierra la puerta ante acceso directo (PostgREST con anon key).

ALTER TABLE dotacion_periodos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dotacion_grupos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dotacion_tandas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dotacion_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE dotacion_pagos       ENABLE ROW LEVEL SECURITY;

-- Política RESTRICTIVA: denegar todo acceso anónimo
-- (anon key no debe poder leer datos de dotación directamente)
CREATE POLICY deny_anon_all ON dotacion_periodos
  AS RESTRICTIVE FOR ALL TO anon USING (false);

CREATE POLICY deny_anon_all ON dotacion_grupos
  AS RESTRICTIVE FOR ALL TO anon USING (false);

CREATE POLICY deny_anon_all ON dotacion_tandas
  AS RESTRICTIVE FOR ALL TO anon USING (false);

CREATE POLICY deny_anon_all ON dotacion_asignaciones
  AS RESTRICTIVE FOR ALL TO anon USING (false);

CREATE POLICY deny_anon_all ON dotacion_pagos
  AS RESTRICTIVE FOR ALL TO anon USING (false);

-- Política PERMISSIVA: solo service_role puede leer/escribir
-- (el backend usa service_role → sigue funcionando normalmente)
CREATE POLICY service_role_only ON dotacion_periodos
  AS PERMISSIVE FOR ALL TO public USING (auth.role() = 'service_role');

CREATE POLICY service_role_only ON dotacion_grupos
  AS PERMISSIVE FOR ALL TO public USING (auth.role() = 'service_role');

CREATE POLICY service_role_only ON dotacion_tandas
  AS PERMISSIVE FOR ALL TO public USING (auth.role() = 'service_role');

CREATE POLICY service_role_only ON dotacion_asignaciones
  AS PERMISSIVE FOR ALL TO public USING (auth.role() = 'service_role');

CREATE POLICY service_role_only ON dotacion_pagos
  AS PERMISSIVE FOR ALL TO public USING (auth.role() = 'service_role');

-- ─── 2. RLS adicional: daily_performance ─────────────────────
-- Esta tabla tampoco tiene políticas de servicio.
-- (Si RLS ya está habilitado, solo agregar las políticas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'daily_performance' AND rowsecurity = true
  ) THEN
    EXECUTE 'ALTER TABLE daily_performance ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

CREATE POLICY service_role_only ON daily_performance
  AS PERMISSIVE FOR ALL TO public USING (auth.role() = 'service_role');

-- ─── Verificación post-ejecución ─────────────────────────────
-- Confirmar RLS habilitado en tablas dotacion:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN (
  'dotacion_periodos','dotacion_grupos','dotacion_tandas',
  'dotacion_asignaciones','dotacion_pagos','daily_performance'
);

-- Confirmar políticas creadas:
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename LIKE 'dotacion%' OR tablename = 'daily_performance';

-- Confirmar clubs activos:
SELECT id, name, country, country_code FROM clubs WHERE country IN ('Panama','Costa Rica') ORDER BY country, name;
