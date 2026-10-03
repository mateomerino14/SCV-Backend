-- =====================================================================
-- Configuracion de recordatorios (octubre 2026)
-- Ya incluido en 01, 03 y 04; solo para bases creadas antes, se puede correr mas de una vez
-- =====================================================================

-- ------------------------------------------------------------
-- Configuracion del resumen de pendientes (una sola fila)
-- ------------------------------------------------------------
-- Dias (0 domingo a 6 sabado) y horas (HH:MM, hora Bolivia) del resumen de pendientes

create table if not exists "Configuracion_Recordatorio" (
  id smallint primary key default 1 check (id = 1),
  activo boolean not null default true,
  dias smallint[] not null default '{1,2,3,4,5}',
  horas text[] not null default '{08:00,12:00,16:00}',
  fecha_actualizacion timestamptz not null default now(),
  id_usuario_actualizacion integer references "Usuario"(id_usuario) on delete set null
);

-- Valores iniciales: de lunes a viernes a las 08:00, 12:00 y 16:00 (hora Bolivia)
insert into "Configuracion_Recordatorio" (id) values (1)
on conflict (id) do nothing;

alter table public."Configuracion_Recordatorio" enable row level security;
