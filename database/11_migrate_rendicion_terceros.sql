-- ------------------------------------------------------------
-- Migracion: rendicion por terceros
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

create table if not exists "Solicitud_Reemplazo" (
  id_solicitud serial primary key,
  estado varchar(20) not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  observacion_revisor varchar(500),
  fecha_solicitud timestamptz default now(),
  fecha_respuesta timestamptz,
  id_viaje integer not null references "Viaje"(id_viaje) on delete cascade,
  id_solicitante integer not null,
  id_sustituto integer not null,
  id_revisor integer,
  constraint solicitud_reemplazo_solicitante_fkey foreign key (id_solicitante) references "Usuario"(id_usuario),
  constraint solicitud_reemplazo_sustituto_fkey foreign key (id_sustituto) references "Usuario"(id_usuario),
  constraint solicitud_reemplazo_revisor_fkey foreign key (id_revisor) references "Usuario"(id_usuario)
);

create index if not exists idx_reemplazo_id_viaje on "Solicitud_Reemplazo"(id_viaje);
create index if not exists idx_reemplazo_id_sustituto on "Solicitud_Reemplazo"(id_sustituto);
create index if not exists idx_reemplazo_estado on "Solicitud_Reemplazo"(estado);

alter table "Solicitud_Reemplazo" enable row level security;
