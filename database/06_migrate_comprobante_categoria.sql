-- ------------------------------------------------------------
-- Migracion: comprobante opcional segun categoria de gasto
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

alter table "Categoria_Gasto"
add column if not exists requiere_comprobante boolean not null default true;

update "Categoria_Gasto"
set requiere_comprobante = false
where nombre = '626010 TAXIS (VIAJE)';
