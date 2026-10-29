-- Una persona puede pedir más camisas en la misma tanda cuando terminó de pagar lo anterior.
-- Cada pedido lleva su número (1, 2, 3…); el primero de todos los existentes queda como 1.
alter table public.dotacion_asignaciones
  add column if not exists secuencia int not null default 1 check (secuencia >= 1);

alter table public.dotacion_asignaciones drop constraint if exists dotacion_asignaciones_tanda_id_employee_id_key;
alter table public.dotacion_asignaciones
  add constraint dotacion_asignaciones_tanda_empleado_secuencia_key unique (tanda_id, employee_id, secuencia);
