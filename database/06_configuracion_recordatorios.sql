-- =====================================================================
-- Configuracion de recordatorios (octubre 2026)
-- Ya incluido en 01_schema.sql, 03_seed.sql y 04_rls_hardening.sql: solo se corre
-- en bases creadas antes. Se puede correr mas de una vez sin problema.
-- =====================================================================

-- ------------------------------------------------------------
-- Configuracion del resumen de pendientes (una sola fila)
-- ------------------------------------------------------------
-- Dias (0 = domingo ... 6 = sabado) y horas (HH:MM, hora Bolivia) en que se envia
-- el resumen de pendientes. La edita el administrador desde la pantalla Recordatorios.

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
