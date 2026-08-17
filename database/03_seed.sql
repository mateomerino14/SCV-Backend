------------------------------------------------------------
-- Crea los 5 roles del sistema con ids fijos
------------------------------------------------------------
insert into "Rol" (id_rol, nombre) values
  (1, 'ADMINISTRADOR'),
  (2, 'EMPLEADO'),
  (3, 'SUPERVISOR'),
  (4, 'REVISOR'),
  (5, 'APROBADOR')
on conflict (id_rol) do nothing;

------------------------------------------------------------
-- Crea los cargos que solo puede tener un usuario activo a la vez
------------------------------------------------------------
insert into "Cargo" (nombre, monto_diario, activo) values
  ('Asistente Administrativo de Seguros y Servicios', 0, true),
  ('Asistente Administrativo - Cargo y Descargo de Cta. Documentada', 0, true),
  ('Asistente de Caja y Tesoreria', 0, true),
  ('Gerente RRHH', 0, true),
  ('Jefe de Recursos Humanos', 0, true)
on conflict (nombre) do nothing;

------------------------------------------------------------
-- Crea el impuesto de IVA usado en Bolivia (13%)
------------------------------------------------------------
insert into "Impuesto" (nombre, porcentaje) values
  ('IVA 13%', 13)
on conflict do nothing;