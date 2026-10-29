-- Conciliación de descuentos de dotación: cada quincena tiene un lote que RRHH concilia contra la planilla.
create table if not exists public.dotacion_lotes (
  id              uuid primary key default gen_random_uuid(),
  fecha_quincena  date not null unique,
  estado          text not null default 'abierto' check (estado in ('abierto', 'conciliado')),
  creado_at       timestamptz not null default now(),
  conciliado_por  text,
  conciliado_at   timestamptz,
  archivo_nombre  text,
  resumen         jsonb
);

alter table public.dotacion_lotes enable row level security;
create policy deny_anon_all on public.dotacion_lotes as restrictive for all to anon using (false);
create policy service_role_only on public.dotacion_lotes for all to service_role using (true) with check (true);

-- Rastro de cada pago: quién, de dónde y de qué quincena; y anulación en vez de borrar
alter table public.dotacion_pagos
  add column if not exists registrado_por    text,
  add column if not exists origen            text not null default 'manual',
  add column if not exists lote_id           uuid references public.dotacion_lotes(id),
  add column if not exists anulado_at        timestamptz,
  add column if not exists anulado_por       text,
  add column if not exists motivo_anulacion  text;

alter table public.dotacion_pagos
  add constraint dotacion_pagos_origen_check check (origen in ('manual', 'conciliacion'));

-- Una cuota anulada no debe impedir volver a registrarla
alter table public.dotacion_pagos drop constraint if exists dotacion_pagos_cuota_unica;
create unique index if not exists dotacion_pagos_cuota_unica_activa
  on public.dotacion_pagos (asignacion_id, numero_cuota) where anulado_at is null;

create index if not exists idx_dot_pagos_lote on public.dotacion_pagos(lote_id);
