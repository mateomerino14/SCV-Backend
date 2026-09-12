-- ------------------------------------------------------------
-- Migracion: carnet de identidad del empleado
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

alter table "Usuario"
add column if not exists carnet_identidad varchar(20);
