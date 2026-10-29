-- El formulario público ofrece de 1 a 5 cuotas y el servidor las acepta, pero la base solo admitía 1 o 2:
-- quien elegía 3, 4 o 5 recibía "Error al registrar selección" y no quedaba registrada.
alter table public.dotacion_asignaciones drop constraint if exists dotacion_asignaciones_cuotas_check;
alter table public.dotacion_asignaciones
  add constraint dotacion_asignaciones_cuotas_check check (cuotas between 1 and 5);
