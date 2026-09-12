-- ------------------------------------------------------------
-- Migracion: indicador de alcohol a nivel de gasto individual
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

alter table "Gasto"
add column if not exists tiene_alcohol boolean not null default false;
