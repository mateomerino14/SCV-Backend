-- ============================================================
-- CARGA DE ORGANIZACION DE PRUEBA (jerarquia real)
-- ============================================================
-- Crea una pequena organizacion de prueba para validar el
-- comportamiento completo de la jerarquia por jefe directo:
--
--   Lucia (REVISOR)
--     `-- Pedro (APROBADOR)
--          `-- Maria (SUPERVISOR, seccion "Ventas")
--               `-- Juan (EMPLEADO, seccion "Ventas")
--               `-- Ana  (EMPLEADO, seccion "Ventas")
--          `-- Jorge (SUPERVISOR, seccion "Logistica")
--               `-- Carlos (EMPLEADO, seccion "Logistica")
--
--   Sofia (EMPLEADO, seccion "Sin Cobertura", SIN jefe directo)
--     -> prueba el respaldo: como nadie de "Sin Cobertura" tiene
--        rol SUPERVISOR, su viaje deberia mostrarse a TODOS los
--        supervisores (nivel 3 del respaldo)
--
--   Admin (ADMINISTRADOR) y Tesoro (cargo de tesoreria), sin
--   participar de la jerarquia de revision.
--
-- La contrasenia de TODOS los usuarios de prueba es: Prueba1234
-- ============================================================

-- Cargos de prueba con montos diarios reales, para probar el
-- control de gasto diario (los cargos del seed original tienen 0).
insert into "Cargo" (nombre, monto_diario, monto_diario_usd, activo) values
  ('Analista de Prueba', 300, 40, true),
  ('Jefe de Area de Prueba', 350, 45, true)
on conflict (nombre) do nothing;

insert into "Usuario" (email_corporativo, nombre, apellido_paterno, contrasenia, activo, numero_seccion, id_cargo, id_rol) values
  ('admin.prueba@maxam.com', 'Admin', 'Prueba', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, null,
    (select id_cargo from "Cargo" where nombre = 'Gerente RRHH'), 1),
  ('tesoro.prueba@maxam.com', 'Tesoro', 'Prueba', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, null,
    (select id_cargo from "Cargo" where nombre = 'Asistente de Caja y Tesoreria'), 3),
  ('lucia.revisora@maxam.com', 'Lucía', 'Revisora', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, null,
    (select id_cargo from "Cargo" where nombre = 'Jefe de Recursos Humanos'), 4),
  ('pedro.aprobador@maxam.com', 'Pedro', 'Aprobador', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, null,
    (select id_cargo from "Cargo" where nombre = 'Asistente Administrativo de Seguros y Servicios'), 5),
  ('maria.supervisora@maxam.com', 'María', 'Supervisora', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, 'Ventas',
    (select id_cargo from "Cargo" where nombre = 'Jefe de Area de Prueba'), 2),
  ('jorge.supervisor@maxam.com', 'Jorge', 'Supervisor', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, 'Logistica',
    (select id_cargo from "Cargo" where nombre = 'Jefe de Area de Prueba'), 2),
  ('juan.empleado@maxam.com', 'Juan', 'Empleado', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, 'Ventas',
    (select id_cargo from "Cargo" where nombre = 'Analista de Prueba'), 3),
  ('ana.empleada@maxam.com', 'Ana', 'Empleada', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, 'Ventas',
    (select id_cargo from "Cargo" where nombre = 'Analista de Prueba'), 3),
  ('carlos.empleado@maxam.com', 'Carlos', 'Empleado', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, 'Logistica',
    (select id_cargo from "Cargo" where nombre = 'Analista de Prueba'), 3),
  ('sofia.sincobertura@maxam.com', 'Sofía', 'SinCobertura', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, 'Sin Cobertura',
    (select id_cargo from "Cargo" where nombre = 'Analista de Prueba'), 3)
on conflict (email_corporativo) do nothing;

-- Arma la cadena de jefe directo (se hace en un segundo paso porque
-- los ids se generan automaticamente al insertar).
update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'lucia.revisora@maxam.com')
  where email_corporativo = 'pedro.aprobador@maxam.com';

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'pedro.aprobador@maxam.com')
  where email_corporativo in ('maria.supervisora@maxam.com', 'jorge.supervisor@maxam.com');

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'maria.supervisora@maxam.com')
  where email_corporativo in ('juan.empleado@maxam.com', 'ana.empleada@maxam.com');

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'jorge.supervisor@maxam.com')
  where email_corporativo = 'carlos.empleado@maxam.com';

-- Sofia queda deliberadamente sin id_jefe_directo, para probar el respaldo.

-- Verificacion: muestra la cadena completa armada.
select
  u.nombre || ' ' || u.apellido_paterno as usuario,
  r.nombre as rol,
  u.numero_seccion as seccion,
  jefe.nombre || ' ' || jefe.apellido_paterno as jefe_directo
from "Usuario" u
left join "Usuario" jefe on jefe.id_usuario = u.id_jefe_directo
left join "Rol" r on r.id_rol = u.id_rol
where u.email_corporativo like '%@maxam.com'
order by u.id_usuario;
