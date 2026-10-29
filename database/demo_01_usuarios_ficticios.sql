-- ============================================================
-- USUARIOS DE LA DEMO (MAXAM FANEXA) - personas ficticias
-- ============================================================
-- Correr despues de reconstruir la base (testing_00_borrar_todo.sql y luego 01 a 04)
-- Los nombres son ficticios; solo tres cuentas usan correos reales para recibir los avisos de prueba:
--   empleado    mateomerino988@gmail.com  (Comercial, EXPORT SALES 220)
--   aprobador   mateomerino14@gmail.com   (Gerente General, REGIONAL BUSINESS MANAGEMENT 240), jefe directo de todos
--   tesorera    202301308@est.umss.edu    (Asistente de Caja y Tesoreria, FINANCE AND ADMINISTRATION 120)
-- El revisor, el administrador y el compañero del empleado usan correos ficticios (@example.com, no reciben correo)
-- Flujo del viaje: empleado > aprobador (jefe directo, su aprobacion vale tambien como aprobador) > tesoreria
-- Flujo de la rendicion: empleado > aprobador (jefe directo) > revisor (aprobacion final)
-- Todos en la dependencia 900 (SEDE). Contrasena de todos: Viaticos2026 (se cambia en Ajustes de Cuenta)
-- Las tarifas diarias son de prueba: se cambian desde Cargos en el panel del administrador
-- ============================================================

insert into "Cargo" (nombre, monto_diario, monto_diario_usd, activo) values
  ('Gerente General', 300, 100, true),
  ('Comercial', 300, 100, true),
  ('Jefe de Administracion', 300, 100, true),
  ('Analista de Finanzas y Administracion', 300, 100, true)
on conflict (nombre) do nothing;

-- Tesoreria es un cargo unico que ya crea 03_seed.sql; se reconoce por el nombre exacto del cargo
update "Cargo" set monto_diario = 300, monto_diario_usd = 100 where nombre = 'Asistente de Caja y Tesoreria';

insert into "Seccion" (nombre, codigo_seccion, activo) values
  ('EXPORT SALES', '220', true),
  ('REGIONAL BUSINESS MANAGEMENT', '240', true),
  ('ADMINISTRACION', '837', true),
  ('FINANCE AND ADMINISTRATION', '120', true)
on conflict (nombre) do update set codigo_seccion = excluded.codigo_seccion, activo = true;

insert into "Vehiculo" (placa, descripcion) values
  ('2345-ABC', 'Camioneta Toyota Hilux'),
  ('3456-BCD', 'Vagoneta Nissan Patrol'),
  ('4567-CDE', 'Camioneta Mitsubishi L200')
on conflict (placa) do nothing;

-- Roles: 1 administrador, 3 empleado, 4 revisor, 5 aprobador; la tesorera es empleada con el cargo de tesoreria
insert into "Usuario" (email_corporativo, nombre, apellido_paterno, apellido_materno, contrasenia, activo, codigo_dependencia, id_seccion, id_cargo, id_rol) values
  ('mateomerino14@gmail.com', 'Ricardo', 'Salinas', 'Paredes', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'REGIONAL BUSINESS MANAGEMENT'),
    (select id_cargo from "Cargo" where nombre = 'Gerente General'), 5),
  ('mateomerino988@gmail.com', 'Valeria', 'Quiroga', 'Mendez', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'EXPORT SALES'),
    (select id_cargo from "Cargo" where nombre = 'Comercial'), 3),
  ('202301308@est.umss.edu', 'Lucia', 'Fernandez', 'Rocha', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'FINANCE AND ADMINISTRATION'),
    (select id_cargo from "Cargo" where nombre = 'Asistente de Caja y Tesoreria'), 3),
  ('revisor@example.com', 'Andres', 'Villarroel', 'Gutierrez', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'ADMINISTRACION'),
    (select id_cargo from "Cargo" where nombre = 'Jefe de Administracion'), 4),
  ('admin@example.com', 'Paola', 'Arce', 'Terrazas', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'FINANCE AND ADMINISTRATION'),
    (select id_cargo from "Cargo" where nombre = 'Analista de Finanzas y Administracion'), 1),
  ('companero@example.com', 'Diego', 'Camacho', 'Lopez', '$2b$10$kS81IPI4x9LTIx3yXF85Guj8vnxe7H2KFX.BiDYMZdj77sna0oGee', true, '900',
    (select id_seccion from "Seccion" where nombre = 'EXPORT SALES'),
    (select id_cargo from "Cargo" where nombre = 'Comercial'), 3)
on conflict (email_corporativo) do nothing;

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'mateomerino14@gmail.com')
  where email_corporativo in ('mateomerino988@gmail.com', '202301308@est.umss.edu', 'revisor@example.com', 'admin@example.com', 'companero@example.com');

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
