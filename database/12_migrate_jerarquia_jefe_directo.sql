-- ------------------------------------------------------------
-- Migracion: jerarquia real (jefe directo) en reemplazo del
-- codigo de dependencia compartido. ADVERTENCIA: si ya cargaste
-- datos en numero_dependencia (codigos de texto), se pierden, ya
-- que el nuevo campo es una referencia a otro usuario, no un texto.
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

alter table "Usuario" drop column if exists numero_dependencia;

alter table "Usuario"
add column if not exists id_jefe_directo integer references "Usuario"(id_usuario);

create index if not exists idx_usuario_jefe_directo on "Usuario"(id_jefe_directo);
create index if not exists idx_usuario_seccion on "Usuario"(numero_seccion);
