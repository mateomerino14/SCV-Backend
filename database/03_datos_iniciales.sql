-- ============================================================
-- SCV · 03 DATOS INICIALES
-- ============================================================
-- Roles, cargos, impuesto IVA, plan de cuentas (categorías de gasto) y recordatorios por defecto.
-- Se corre después de 02_funciones.sql.
-- ============================================================

-- Ids fijos: el cliente exige el rol 2 para supervisor y el 4 para revisor
insert into "Rol" (id_rol, nombre) values
  (1, 'ADMINISTRADOR'),
  (2, 'SUPERVISOR'),
  (3, 'EMPLEADO'),
  (4, 'REVISOR'),
  (5, 'APROBADOR')
on conflict (id_rol) do nothing;

-- Cargos de un solo usuario activo; el monto diario se configura desde el panel
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

-- Plan de cuentas de gastos de la empresa (planilla de Castro); el nombre empieza con la cuenta contable de Oracle
insert into "Categoria_Gasto" (nombre) values
  ('649001 SEGUROS ACCIDENTES PERSONAL'),
  ('649200 ALIMENTACION (PERSONAL)'),
  ('649300 TRANSPORTE PERSONAL'),
  ('631006 PATENTES'),
  ('631020 IMPUESTO A LA PROPIEDAD DE INMU'),
  ('631040 IMPUESTO A LOS VEHICULOS AUTOMO'),
  ('631070 IMPUESTO A LAS TRANSACCIONES FINANCIERAS'),
  ('631210 OTROS IMPUESTOS Y TASAS'),
  ('631213 MULTAS SIN'),
  ('621010 ALQUILER EDIF. ADMINISTRATIVOS Y CO'),
  ('621020 ALQUILER ALMACENES'),
  ('621030 ALQUILER EDIF. SOCIALES Y VIVIENDAS'),
  ('621050 ALQUILER MAQUINARIA'),
  ('621060 ALQUILER UTILLAJE'),
  ('621070 ALQUILER OTRAS INSTALACIONES'),
  ('621080 ALQUILER MOBILIARIO'),
  ('621090 ALQUILER EQUIP. INFORMATICOS'),
  ('621100 ALQUILER ELEMEMTOS TRANSPORTE'),
  ('622010 MANTENIMIENTO EDIF. INDUSTRIALES'),
  ('622020 MANTENIMIENTO EDIF. ADMINISTRATIVOS'),
  ('622030 MANTENIMIENTO ALMACENES'),
  ('622040 MANTENIMIENTO EDIF. SOCIALES Y VIVIENDAS'),
  ('622050 MANTENIMIENTO VIAS Y CARRETERAS'),
  ('622060 MANTENIMIENTO INSTALACIONES TECNICAS'),
  ('622070 MANTENIMIENTO MAQUINARIA'),
  ('622080 MANTENIMIENTO UTILLAJE'),
  ('622090 MANTENIMIENTO OTRAS INSTALACIONES'),
  ('622100 MANTENIMIENTO MOBILIARIO'),
  ('622110 MANTENIMIENTO EQUIP. INFORMATICOS'),
  ('622120 MANTENIMIENTO ELEM. TRANSPORTE'),
  ('622121 MANTENIMIENTO VEHICULOS'),
  ('622130 MANTENIMIENTO INST. SEGURIDAD'),
  ('623000 SERVICIOS DE LIMPIEZA'),
  ('623040 GESTION DE RESIDUOS'),
  ('623080 ANALISIS DE LABORATORIO'),
  ('623010 SERV. SEGURIDAD Y VIGILANCIA'),
  ('623160 GARANTIAS COMERCIALES'),
  ('623200 AUDITORES'),
  ('623220 CONSULTORIA LEGAL'),
  ('623230 CONSULTORIA TECNICA'),
  ('623231 GASTOS ASESORAMIENTO SEGURIDAD'),
  ('623240 CONSULTORIA COMERCIAL'),
  ('623250 CONSULTORIA DE GESTION'),
  ('623800 TRAINING'),
  ('625010 SEGURO DE PROD. TERMINADOS'),
  ('625070 PRIMAS DE SEGURO'),
  ('629320 SERVICIOS BANCARIOS'),
  ('629330 COMISIONES AVALES'),
  ('627000 PUBLICIDAD Y PROPAGANDA'),
  ('627001 PUBLICACIONES'),
  ('627010 JORNADAS TECNICAS'),
  ('627020 FERIAS Y EXPOSICIONES'),
  ('627030 GASTOS DE REPRESENTACION'),
  ('627050 REUNIONES'),
  ('626000 BILLETES (VIAJE)'),
  ('626010 TAXIS (VIAJE)'),
  ('626020 COCHE PROPIO-KMS (VIAJE)'),
  ('626030 HOTELES (VIAJE)'),
  ('626040 MANUTENCION (VIAJE)'),
  ('626050 VEHICULOS DE ALQUILER (VIAJE)'),
  ('626060 PEAJE AUTOPISTAS (VIAJE)'),
  ('626070 APARCAMIENTO Y OTROS GASTOS (VIAJE)'),
  ('626100 REUN.SINDIC.MANUTENCION/AT.TERCEROS (VIAJE)'),
  ('628000 ENERGÍA ELÉCTRICA'),
  ('628010 AGUA'),
  ('628020 GAS / FUEL'),
  ('628021 GASOLINA'),
  ('628022 GASOLEO (DIESEL)'),
  ('628045 OTROS FLUIDOS'),
  ('628040 SUMINISTRO MATERIALES AUXILIARE'),
  ('629000 TELEFONOS'),
  ('629010 FRANQUEO CORRESPONDENCIA'),
  ('629020 TELETRANSMISION'),
  ('629030 TELEGRAMAS Y TELETIPOS'),
  ('629040 SERVICIO DE MENSAJERIA'),
  ('629060 TAXIS GESTION OFICINA (BOLIVIA)'),
  ('629100 SUCRIPCION PRENSA, LIBROS Y REV'),
  ('629110 CUOTAS DE ASOCIACION'),
  ('629130 DONACIONES-OBSEQUIOS'),
  ('629200 MATERIAL DE OFICINA'),
  ('629210 IMPRENTA Y FOTOCOPIAS'),
  ('629220 TRAMITES Y PERMISOS MIN. DEFENS'),
  ('629300 OTROS GASTOS SERVICIOS GENERALES'),
  ('629301 MATERIAL DE ASEO Y LIMPIEZA'),
  ('629302 TRANSPORTE DE MATERIALES VARIOS'),
  ('629303 OTROS SERVICIOS GENERALES- MEDICAMENTOS'),
  ('629304 OTROS SERVICIOS GENERALES- PERIODICOS'),
  ('629305 MATERIAL DE SEGURIDAD INDUSTRIAL'),
  ('629306 TRAMITES Y GASTOS LEGALES'),
  ('629307 OTROS SERVICIOS GENERALES- WORK (ROPA DE TRABAJO)'),
  ('629310 ATENC, CONSEJO ADMINISTRACION'),
  ('629400 MUESTRAS DE PRODUCTOS PARA PRUEBAS'),
  ('629401 CONTROL DE CALIDAD (BOLIVIA)'),
  ('629500 MUESTRA DE MATERIALES PARA PRUEBA CLIENTES'),
  ('623500 MULTAS Y PENALIZACIONES'),
  ('629350 HERRAMIENTAS Y OTROS DE RAPIDO DESGASTE'),
  ('624000 TRANSPORTE DE PROD. TERMINADOS (CLIENTE)'),
  ('624001 ESCOLTAS PROD. TERMINADO (CLIENTE)'),
  ('624002 CARGUÍOS Y DESCARGUÍOS PT (CLIENTE)'),
  ('624100 TRANSPORTE PROD. TERMINADO (RED COMERCIAL)'),
  ('624101 ESCOLTAS RED COMERCIAL'),
  ('624102 CARGUÍOS Y DESCARGUÍOS RED COMERCIAL'),
  ('624200 TRANSPORTE PROD. TERMINADO EXPORT GRUPO'),
  ('624201 ESCOLTAS EXPORT GRUPO'),
  ('624202 CARGUÍOS Y DESCARGUÍOS GRUPO'),
  ('624300 TRANSPORTE PROD. TERMINADO EXPORT RESTO'),
  ('624301 ESCOLTAS EXPORT RESTO'),
  ('624302 CARGUÍOS Y DESCARGUÍOS RESTO'),
  ('600040 TRANSPORTE S/COMPRA MERCADERIAS'),
  ('601040 TRANSPORTE S/COMPRAS MMPP'),
  ('623120 COMISIONES SOBRE VENTA'),
  ('440230 OPERACIONES PENDIENTES MN'),
  ('OTROS')
on conflict (nombre) do nothing;

update "Categoria_Gasto"
set requiere_comprobante = false
where nombre = '626010 TAXIS (VIAJE)';

-- Nota de cuando usar cada cuenta, tomada de la planilla de Castro
update "Categoria_Gasto" set descripcion = 'Solo gastos de personal registrado en planilla de sueldos; no estibadores ni personal externo' where nombre = '649001 SEGUROS ACCIDENTES PERSONAL';
update "Categoria_Gasto" set descripcion = 'Almuerzos, leches, agua' where nombre = '649200 ALIMENTACION (PERSONAL)';
update "Categoria_Gasto" set descripcion = 'Transporte personal domicilio/planta/domicilio' where nombre = '649300 TRANSPORTE PERSONAL';
update "Categoria_Gasto" set descripcion = 'Alquiler maquinaria pesada' where nombre = '621050 ALQUILER MAQUINARIA';
update "Categoria_Gasto" set descripcion = 'Alquiler vehículos/cisterna' where nombre = '621100 ALQUILER ELEMEMTOS TRANSPORTE';
update "Categoria_Gasto" set descripcion = 'Mantenimiento edificación planta productiva' where nombre = '622010 MANTENIMIENTO EDIF. INDUSTRIALES';
update "Categoria_Gasto" set descripcion = 'Mantenimiento oficinas administrativas' where nombre = '622020 MANTENIMIENTO EDIF. ADMINISTRATIVOS';
update "Categoria_Gasto" set descripcion = 'Mantenimiento almacenes' where nombre = '622030 MANTENIMIENTO ALMACENES';
update "Categoria_Gasto" set descripcion = 'Mantenimiento equipo y maquinaria' where nombre = '622070 MANTENIMIENTO MAQUINARIA';
update "Categoria_Gasto" set descripcion = 'Mantenimiento herramientas' where nombre = '622080 MANTENIMIENTO UTILLAJE';
update "Categoria_Gasto" set descripcion = 'Mantenimiento pararrayos, postes de luz, accesos a planta' where nombre = '622090 MANTENIMIENTO OTRAS INSTALACIONES';
update "Categoria_Gasto" set descripcion = 'Mantenimiento muebles y enseres' where nombre = '622100 MANTENIMIENTO MOBILIARIO';
update "Categoria_Gasto" set descripcion = 'Mantenimiento aparatos eléctricos y/o electrónicos (equipos de computación, cámaras, balanzas electrónicas y otros eléctricos)' where nombre = '622110 MANTENIMIENTO EQUIP. INFORMATICOS';
update "Categoria_Gasto" set descripcion = 'Mantenimiento montacargas/grúas' where nombre = '622120 MANTENIMIENTO ELEM. TRANSPORTE';
update "Categoria_Gasto" set descripcion = 'Mantenimiento vehículos' where nombre = '622121 MANTENIMIENTO VEHICULOS';
update "Categoria_Gasto" set descripcion = 'Servicios de recojo de basura, limpieza de oficinas o predios' where nombre = '623000 SERVICIOS DE LIMPIEZA';
update "Categoria_Gasto" set descripcion = 'Servicios de tratamiento de residuos' where nombre = '623040 GESTION DE RESIDUOS';
update "Categoria_Gasto" set descripcion = 'Análisis de laboratorio' where nombre = '623080 ANALISIS DE LABORATORIO';
update "Categoria_Gasto" set descripcion = 'Todos los gastos de alimentación, dotación de ropa o menaje para la guardia' where nombre = '623010 SERV. SEGURIDAD Y VIGILANCIA';
update "Categoria_Gasto" set descripcion = 'Servicios contratados a consultores externos para trabajos definidos' where nombre = '623200 AUDITORES';
update "Categoria_Gasto" set descripcion = 'Gastos de capacitación al personal' where nombre = '623800 TRAINING';
update "Categoria_Gasto" set descripcion = 'Transporte para movilización cuando el personal está de viaje' where nombre = '626010 TAXIS (VIAJE)';
update "Categoria_Gasto" set descripcion = 'Alimentación cuando el personal está de viaje' where nombre = '626040 MANUTENCION (VIAJE)';
update "Categoria_Gasto" set descripcion = 'En caso de que se utilice para la producción' where nombre = '628010 AGUA';
update "Categoria_Gasto" set descripcion = 'Diesel' where nombre = '628022 GASOLEO (DIESEL)';
update "Categoria_Gasto" set descripcion = 'Tachos, recipientes, bolsas o film y otros materiales auxiliares para producción' where nombre = '628040 SUMINISTRO MATERIALES AUXILIARE';
update "Categoria_Gasto" set descripcion = 'Internet' where nombre = '629020 TELETRANSMISION';
update "Categoria_Gasto" set descripcion = 'Transporte de movilización para trámites operativos o propios de la planta (no de viaje)' where nombre = '629060 TAXIS GESTION OFICINA (BOLIVIA)';
update "Categoria_Gasto" set descripcion = 'Material de escritorio, mouse, teclado, engrapadora, perforadora, hojas y otros materiales para el funcionamiento de la oficina' where nombre = '629200 MATERIAL DE OFICINA';
update "Categoria_Gasto" set descripcion = 'Para gastos inespecíficos o que no se encuentran en el detalle de cuentas' where nombre = '629300 OTROS GASTOS SERVICIOS GENERALES';
update "Categoria_Gasto" set descripcion = 'Fletes de envíos de otros materiales o MP pequeñas y estibajes internos planta productiva' where nombre = '629302 TRANSPORTE DE MATERIALES VARIOS';
update "Categoria_Gasto" set descripcion = 'Medicamentos' where nombre = '629303 OTROS SERVICIOS GENERALES- MEDICAMENTOS';
update "Categoria_Gasto" set descripcion = 'Equipo de protección personal (EPP)' where nombre = '629305 MATERIAL DE SEGURIDAD INDUSTRIAL';
update "Categoria_Gasto" set descripcion = 'Trámites exportaciones, trámites sustancias controladas, trámites licencia de funcionamiento, trámites instituciones públicas, preocupacionales' where nombre = '629306 TRAMITES Y GASTOS LEGALES';
update "Categoria_Gasto" set descripcion = 'Ropa de trabajo' where nombre = '629307 OTROS SERVICIOS GENERALES- WORK (ROPA DE TRABAJO)';
update "Categoria_Gasto" set descripcion = 'Activos fungibles (impresoras, sillas de escritorio y otros activos de menor valor, menos de USD 1000, y con durabilidad menor a 3 años); se aplica el segmento complementario según el tipo de activo' where nombre = '629350 HERRAMIENTAS Y OTROS DE RAPIDO DESGASTE';

-- Recordatorios: de lunes a viernes a las 08:00, 12:00 y 16:00 (hora Bolivia)
insert into "Configuracion_Recordatorio" (id) values (1)
on conflict (id) do nothing;
