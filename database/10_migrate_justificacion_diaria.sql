-- ------------------------------------------------------------
-- Migracion: justificacion por dia excedido
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

alter table "Comentario"
add column if not exists fecha_justificada date;
