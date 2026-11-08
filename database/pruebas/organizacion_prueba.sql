-- ============================================================
-- SCV · PRUEBAS · ORGANIZACIÓN DE PRUEBA
-- ============================================================
-- Lucía (revisor) > Pedro (aprobador) > María (Ventas) y Jorge (Logística), supervisores de sus empleados.
-- Sofía queda sin jefe y sin supervisor en su sección: su viaje lo ven todos los supervisores.
-- Incluye tres vehículos. La usan las pruebas automáticas. Contraseña de todos: Prueba1234
-- ============================================================

insert into "Cargo" (nombre, monto_diario, monto_diario_usd, activo) values
  ('Analista de Prueba', 300, 40, true),
  ('Jefe de Area de Prueba', 350, 45, true)
on conflict (nombre) do nothing;

insert into "Seccion" (nombre, activo) values
  ('Ventas', true),
  ('Logistica', true),
  ('Sin Cobertura', true)
on conflict (nombre) do nothing;

insert into "Vehiculo" (placa, descripcion) values
  ('2345-ABC', 'Camioneta Toyota Hilux'),
  ('3456-BCD', 'Vagoneta Nissan Patrol'),
  ('4567-CDE', 'Camioneta Mitsubishi L200')
on conflict (placa) do nothing;

insert into "Usuario" (email_corporativo, nombre, apellido_paterno, contrasenia, activo, id_seccion, id_cargo, id_rol) values
  ('admin.prueba@maxam.com', 'Admin', 'Prueba', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, null,
    (select id_cargo from "Cargo" where nombre = 'Gerente RRHH'), 1),
  ('tesoro.prueba@maxam.com', 'Tesoro', 'Prueba', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, null,
    (select id_cargo from "Cargo" where nombre = 'Asistente de Caja y Tesoreria'), 3),
  ('lucia.revisora@maxam.com', 'Lucía', 'Revisora', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, null,
    (select id_cargo from "Cargo" where nombre = 'Jefe de Recursos Humanos'), 4),
  ('pedro.aprobador@maxam.com', 'Pedro', 'Aprobador', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true, null,
    (select id_cargo from "Cargo" where nombre = 'Asistente Administrativo de Seguros y Servicios'), 5),
  ('maria.supervisora@maxam.com', 'María', 'Supervisora', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true,
    (select id_seccion from "Seccion" where nombre = 'Ventas'),
    (select id_cargo from "Cargo" where nombre = 'Jefe de Area de Prueba'), 2),
  ('jorge.supervisor@maxam.com', 'Jorge', 'Supervisor', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true,
    (select id_seccion from "Seccion" where nombre = 'Logistica'),
    (select id_cargo from "Cargo" where nombre = 'Jefe de Area de Prueba'), 2),
  ('juan.empleado@maxam.com', 'Juan', 'Empleado', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true,
    (select id_seccion from "Seccion" where nombre = 'Ventas'),
    (select id_cargo from "Cargo" where nombre = 'Analista de Prueba'), 3),
  ('ana.empleada@maxam.com', 'Ana', 'Empleada', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true,
    (select id_seccion from "Seccion" where nombre = 'Ventas'),
    (select id_cargo from "Cargo" where nombre = 'Analista de Prueba'), 3),
  ('carlos.empleado@maxam.com', 'Carlos', 'Empleado', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true,
    (select id_seccion from "Seccion" where nombre = 'Logistica'),
    (select id_cargo from "Cargo" where nombre = 'Analista de Prueba'), 3),
  ('sofia.sincobertura@maxam.com', 'Sofía', 'SinCobertura', '$2b$10$9fflRI7SntFdGUQ/.k8iMuoUoOqRoq7IHEOba119yQx8lILTURQfa', true,
    (select id_seccion from "Seccion" where nombre = 'Sin Cobertura'),
    (select id_cargo from "Cargo" where nombre = 'Analista de Prueba'), 3)
on conflict (email_corporativo) do nothing;

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'lucia.revisora@maxam.com')
  where email_corporativo = 'pedro.aprobador@maxam.com';

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'pedro.aprobador@maxam.com')
  where email_corporativo in ('maria.supervisora@maxam.com', 'jorge.supervisor@maxam.com');

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'maria.supervisora@maxam.com')
  where email_corporativo in ('juan.empleado@maxam.com', 'ana.empleada@maxam.com');

update "Usuario" set id_jefe_directo = (select id_usuario from "Usuario" where email_corporativo = 'jorge.supervisor@maxam.com')
  where email_corporativo = 'carlos.empleado@maxam.com';

-- Sofia queda sin jefe directo para probar el respaldo

-- Firma digital guardada de cada usuario de prueba, con la que firman sus aprobaciones
insert into "Firma_Usuario" (id_usuario, imagen)
select id_usuario, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAYAAAA16j4lAAAB1klEQVR4Xu2Zy3HCQBiDITVQDuWnHHpIZg+eccw+9L83g75LDplgRVrJYG43QgghhBBCCCGZPB7Pn3a94yfJ5R55uV6or9d36DXJX76iDNmxsZ+4JiFtWoVb0eJPXRP3Bq/CrWCkaUetCBLdrg2eteT6u6wWI2ZkabGi8dC9wWfOxl1NRIy3gs5yhhYrPY2IbreANacrklm4vcYiZlXQdI3+F2R5XAJGzalo8cH12ruHPAq2gQR7YA4YncER6OGQgK7JriGPPGl6JeE2TAFrwpUKlCI9MDuFbJ3jHup30Zpwz6Atk2DRZPlbK7NDaS2EqsGVZkimXmJOVZM959ilwZ7herU4UpP0TQ3KLFj0NRBEL+Zp5IE15AxNniFHznEPeKIjjLQSpSlqrqPnWD3RUUZaWhytqeF1jaw5NjX4jOTNi4bZjHkav8LaZK+HFRaWE229RyJIDoxXq1C0IVfMsbjBqyZ5on2MKTkcWiQhRzyssDBscHZTEDLWZMQq5B3muEf3Y1JluKMQKzWdkaxaxrqseAt4ByMREyvNW+mr1HblbaKRr9WqqTZwdv1qbcuAG4fIKrH/wcCrR5qv8jIQParMZIdbBQnmCHl1zyOEEEIIIYQQP34BCsyK1WG1RtkAAAAASUVORK5CYII='
from "Usuario"
where email_corporativo like '%@maxam.com'
on conflict (id_usuario) do nothing;

select
  u.nombre || ' ' || u.apellido_paterno as usuario,
  r.nombre as rol,
  s.nombre as seccion,
  jefe.nombre || ' ' || jefe.apellido_paterno as jefe_directo
from "Usuario" u
left join "Usuario" jefe on jefe.id_usuario = u.id_jefe_directo
left join "Rol" r on r.id_rol = u.id_rol
left join "Seccion" s on s.id_seccion = u.id_seccion
where u.email_corporativo like '%@maxam.com'
order by u.id_usuario;
