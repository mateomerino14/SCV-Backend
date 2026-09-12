-- ------------------------------------------------------------
-- Migracion: vehiculo de empresa como medio de transporte
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

alter table "Viaje"
add column if not exists placa_vehiculo varchar(20);
