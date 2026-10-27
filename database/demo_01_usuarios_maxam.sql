-- ============================================================
-- USUARIOS DE LA DEMO (MAXAM)
-- ============================================================
-- Correr despues de testing_01_limpieza_completa.sql, que deja la base sin usuarios ni viajes
-- Jorge Luis Valencia (Gerente General) es el aprobador y el jefe directo de todos:
--   revisa como jefe directo el viaje y la rendicion de Shanayna, y su aprobacion vale tambien como aprobador
-- Flujo del viaje: Shanayna > Jorge Luis (jefe directo y aprobador) > Sonia (tesoreria, asigna el fondo)
-- Flujo de la rendicion: Shanayna > Jorge Luis (jefe directo) > Luis (revisor, aprobacion final)
-- Contrasena de todos: Viaticos2026 (cada uno puede cambiarla en Ajustes de Cuenta)
-- Las tarifas diarias son de prueba: se cambian desde Cargos en el panel del administrador
-- ============================================================

insert into "Cargo" (nombre, monto_diario, monto_diario_usd, activo) values
  ('Gerente General', 300, 100, true),
  ('Comercial', 300, 100, true),
  ('Jefe de Administracion', 300, 100, true),
  ('Analista de Finanzas y Administracion', 300, 100, true)
on conflict (nombre) do nothing;

-- Tesoreria es un cargo unico que ya crea 03_seed.sql; se le ponen las mismas tarifas de prueba
update "Cargo" set monto_diario = 300, monto_diario_usd = 100 where nombre = 'Asistente de Caja y Tesoreria';

insert into "Seccion" (nombre, codigo_seccion, activo) values
  ('EXPORT SALES', '220', true),
  ('REGIONAL BUSINESS MANAGEMENT', '240', true),
  ('ADMINISTRACION', '837', true),
  ('FINANCE AND ADMINISTRATION', '120', true)
on conflict (nombre) do update set codigo_seccion = excluded.codigo_seccion, activo = true;

-- Roles: 1 administrador, 3 empleado, 4 revisor, 5 aprobador; la tesorera es empleada con el cargo de tesoreria
insert into "Usuario" (email_corporativo, nombre, apellido_paterno, apellido_materno, contrasenia, activo, codigo_dependencia, id_seccion, id_cargo, id_rol) values
  ('jvalencia@maxamcorp.com', 'Jorge Luis', 'Valencia', 'Vargas', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'REGIONAL BUSINESS MANAGEMENT'),
    (select id_cargo from "Cargo" where nombre = 'Gerente General'), 5),
  ('spardo@maxamcorp.com', 'Shanayna', 'Pardo', 'Amezaga', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'EXPORT SALES'),
    (select id_cargo from "Cargo" where nombre = 'Comercial'), 3),
  ('smoya@maxamcorp.com', 'Sonia Rita', 'Moya', 'Caballero', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'FINANCE AND ADMINISTRATION'),
    (select id_cargo from "Cargo" where nombre = 'Asistente de Caja y Tesoreria'), 3),
  ('lasoliz@maxamcorp.com', 'Luis Alfredo', 'Soliz', 'Siles', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'ADMINISTRACION'),
    (select id_cargo from "Cargo" where nombre = 'Jefe de Administracion'), 4),
  ('aarraya@maxamcorp.com', 'Annel', 'Arraya', 'Vargas', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'FINANCE AND ADMINISTRATION'),
    (select id_cargo from "Cargo" where nombre = 'Analista de Finanzas y Administracion'), 1)
on conflict (email_corporativo) do nothing;

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'jvalencia@maxamcorp.com')
  where email_corporativo in ('spardo@maxamcorp.com', 'smoya@maxamcorp.com', 'lasoliz@maxamcorp.com', 'aarraya@maxamcorp.com');

select
  u.nombre || ' ' || u.apellido_paterno as usuario,
  r.nombre as rol,
  c.nombre as cargo,
  s.nombre || ' (' || s.codigo_seccion || ')' as seccion,
  u.codigo_dependencia as dependencia,
  jefe.nombre || ' ' || jefe.apellido_paterno as jefe_directo
from "Usuario" u
left join "Usuario" jefe on jefe.id_usuario = u.id_jefe_directo
left join "Rol" r on r.id_rol = u.id_rol
left join "Cargo" c on c.id_cargo = u.id_cargo
left join "Seccion" s on s.id_seccion = u.id_seccion
order by u.id_rol, u.id_usuario;
