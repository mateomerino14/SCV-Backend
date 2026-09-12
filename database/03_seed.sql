-- ============================================================
-- Datos iniciales: roles, cargos, impuesto y categorias de gasto
-- ============================================================

-- Los ids son referenciados por el control de acceso del cliente:
-- las rutas de supervisor exigen el rol 2 y las de revisor el 4.
insert into "Rol" (id_rol, nombre) values
  (1, 'ADMINISTRADOR'),
  (2, 'SUPERVISOR'),
  (3, 'EMPLEADO'),
  (4, 'REVISOR'),
  (5, 'APROBADOR')
on conflict (id_rol) do nothing;

-- Cargos que solo puede ocupar un usuario activo a la vez.
-- El monto diario se configura despues desde el panel de administracion.
insert into "Cargo" (nombre, monto_diario, monto_diario_usd, activo) values
  ('Asistente Administrativo de Seguros y Servicios', 0, 0, true),
  ('Asistente Administrativo - Cargo y Descargo de Cta. Documentada', 0, 0, true),
  ('Asistente de Caja y Tesoreria', 0, 0, true),
  ('Gerente RRHH', 0, 0, true),
  ('Jefe de Recursos Humanos', 0, 0, true)
on conflict (nombre) do nothing;

-- Impuesto de IVA vigente en Bolivia.
insert into "Impuesto" (nombre, porcentaje) values
  ('IVA 13%', 13)
on conflict do nothing;

-- El nombre incorpora la cuenta contable de Oracle seguida de la denominacion.
-- La exportacion de la planilla extrae ese codigo, por lo que el formato debe conservarse.
insert into "Categoria_Gasto" (nombre) values
  ('626000 BILLETES (VIAJE)'),
  ('626010 TAXIS (VIAJE)'),
  ('626020 COCHE PROPIO-KMS (VIAJE)'),
  ('626030 HOTELES (VIAJE)'),
  ('626040 MANUTENCION (VIAJE)'),
  ('626050 VEHICULOS DE ALQUILER (VIAJE)'),
  ('626060 PEAJE AUTOPISTAS (VIAJE)'),
  ('626070 APARCAMIENTO Y OTROS GASTOS (VIAJE)'),
  ('626100 REUN.SINDIC.MANUTENCION/AT.TERCEROS (VIAJE)'),
  ('OTROS')
on conflict (nombre) do nothing;

update "Categoria_Gasto"
set requiere_comprobante = false
where nombre = '626010 TAXIS (VIAJE)';