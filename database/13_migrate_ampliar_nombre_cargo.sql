-- ------------------------------------------------------------
-- Migracion: amplia el largo de Cargo.nombre de 50 a 100 caracteres.
-- El seed original (03_seed.sql) nunca pudo insertar completo el
-- catalogo de cargos en una base nueva, ya que uno de los nombres
-- reales ("Asistente Administrativo - Cargo y Descargo de Cta.
-- Documentada") mide 63 caracteres y excedia el limite de 50.
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

alter table "Cargo" alter column nombre type varchar(100);
