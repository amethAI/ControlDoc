-- RLS en dotación + políticas faltantes. El backend usa service_role, el frontend no toca estas tablas.
do $$ declare t text; begin
  foreach t in array array['dotacion_periodos','dotacion_grupos','dotacion_tandas','dotacion_asignaciones','dotacion_pagos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy deny_anon_all on public.%I as restrictive for all to anon using (false)', t);
    execute format('create policy service_role_only on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
create policy service_role_only on public.daily_performance for all to service_role using (true) with check (true);
create policy service_role_only on public.push_subscriptions for all to service_role using (true) with check (true);

alter function public.sync_employee_country_code() set search_path = public, pg_temp;

-- Una cuota no puede registrarse dos veces
alter table public.dotacion_pagos
  add constraint dotacion_pagos_cuota_unica unique (asignacion_id, numero_cuota);

update public.clubs
  set country_code = 'GT', timezone = 'America/Guatemala', currency = 'GTQ', locale = 'es-GT'
  where country = 'Guatemala';

drop index if exists public.idx_employee_docs_emp_id;
drop index if exists public.idx_emp_docs_employee_current;

-- tanda_id y asignacion_id ya quedan cubiertos por sus unique compuestos
create index if not exists idx_dot_asig_employee  on public.dotacion_asignaciones(employee_id);
create index if not exists idx_dot_tandas_club    on public.dotacion_tandas(club_id);
create index if not exists idx_dot_tandas_periodo on public.dotacion_tandas(periodo_id);
create index if not exists idx_dot_tandas_grupo   on public.dotacion_tandas(grupo_id);
create index if not exists idx_dot_grupos_periodo on public.dotacion_grupos(periodo_id);
create index if not exists idx_push_subs_user     on public.push_subscriptions(user_id);
