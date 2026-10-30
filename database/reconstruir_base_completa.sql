-- ============================================================
-- SCV · RECONSTRUIR LA BASE COMPLETA
-- ============================================================
-- Borra todo y crea la base de nuevo con la demo de usuarios ficticios. Contraseña de todos: Viaticos2026
-- Archivo generado con npm run db:reconstruccion a partir de: mantenimiento/borrar_todo.sql, 01_esquema.sql, 02_funciones.sql, 03_datos_iniciales.sql, 04_seguridad_rls.sql, 05_demo_usuarios_ficticios.sql
-- No se edita a mano: se cambian los scripts de origen y se vuelve a generar.
-- ADVERTENCIA: no se puede deshacer. Nunca en una base con datos reales.
-- ============================================================

-- >>>>> mantenimiento/borrar_todo.sql

-- ============================================================
-- SCV · MANTENIMIENTO · BORRAR TODO
-- ============================================================
-- Elimina todas las tablas, funciones y triggers del sistema para volver a crear la base
-- con 01 a 05. ADVERTENCIA: no se puede deshacer. Nunca en una base con datos reales.
-- ============================================================

drop table if exists
  "Configuracion_Recordatorio",
  "Comentario",
  "Solicitud_Reemplazo",
  "Solicitud_Autorizacion_Plazo",
  "Factura_Impuestos",
  "Detalle_Factura",
  "Factura",
  "Imagen_Respaldo",
  "Imagen",
  "Gasto_Tramo_Moneda",
  "Gasto_Subitem",
  "Gasto",
  "Firma",
  "Documento_Emitido",
  "Viaje",
  "Vehiculo",
  "Auditoria",
  "Codigo_Verificacion",
  "Usuario",
  "Proveedor",
  "Impuesto",
  "Categoria_Gasto",
  "Seccion",
  "Cargo",
  "Rol",
  "Recibo",
  "Correlativo_Rendicion",
  "Correlativo_Viaje",
  "Revision_Viaje",
  "Correlativo_Recibo"
cascade;

-- Funciones y triggers (los triggers se van con sus tablas)
drop function if exists incrementar_correlativo_recibo(char);
drop function if exists incrementar_correlativo_recibo();
drop function if exists asignar_numero_viaje();
drop function if exists asignar_numero_rendicion();

-- >>>>> 01_esquema.sql

-- ============================================================
-- SCV · 01 ESQUEMA
-- ============================================================
-- Crea las 30 tablas del sistema con sus relaciones, restricciones e índices.
-- Primer paso para crear la base desde cero; refleja siempre el esquema final completo.
-- ============================================================

-- ------------------------------------------------------------
-- Catalogo
-- ------------------------------------------------------------

create table if not exists "Rol" (
  id_rol serial primary key,
  nombre varchar(20) not null unique
);

create table if not exists "Cargo" (
  id_cargo serial primary key,
  nombre varchar(100) not null unique,
  monto_diario decimal(10, 2) not null,
  monto_diario_usd numeric(10, 2) default 0,
  activo boolean not null default true
);

create table if not exists "Seccion" (
  id_seccion serial primary key,
  nombre varchar(100) not null unique,
  codigo_seccion varchar(3), -- seccion en la cuenta de Oracle, por ejemplo 200
  activo boolean not null default true
);

create table if not exists "Categoria_Gasto" (
  id_categoria serial primary key,
  nombre varchar(100) not null unique,
  descripcion text, -- cuando usar la cuenta, segun la planilla de Castro
  requiere_comprobante boolean not null default true
);

create table if not exists "Impuesto" (
  id_impuesto serial primary key,
  nombre varchar(50) not null,
  porcentaje decimal(10, 2) not null
);

create table if not exists "Proveedor" (
  id_proveedor serial primary key,
  nombre varchar(150) not null,
  tipo_doc_fiscal varchar(3) check (tipo_doc_fiscal in ('NIT', 'CI')),
  numero_doc_fiscal varchar(50)
);

-- ------------------------------------------------------------
-- Usuarios
-- ------------------------------------------------------------

create table if not exists "Usuario" (
  id_usuario serial primary key,
  email_corporativo varchar(100) not null unique,
  nombre varchar(30) not null,
  apellido_paterno varchar(30) not null,
  apellido_materno varchar(30),
  telefono varchar(8) check (telefono ~ '^[0-9]{7,8}$' or telefono is null),
  activo boolean not null default true,
  contrasenia text not null,
  foto_perfil text,
  id_jefe_directo integer references "Usuario"(id_usuario),
  id_seccion integer references "Seccion"(id_seccion),
  carnet_identidad varchar(15),
  -- dependencia de Oracle de quienes tienen a este usuario como jefe directo (por ejemplo 421); sin jefe, tambien la suya
  codigo_dependencia varchar(3),
  ultima_cambio_contrasenia timestamptz default now(),
  refresh_token_invalido_desde timestamptz,
  -- true mientras tenga una contrasena temporal (recien creado, puesta por el administrador
  -- o recuperada con codigo): debe cambiarla antes de usar el sistema
  debe_cambiar_contrasenia boolean not null default false,
  -- TEMPORAL (cuenta nueva o clave puesta por el administrador) o RECUPERACION (entro con codigo)
  motivo_cambio_contrasenia varchar(15) check (motivo_cambio_contrasenia in ('TEMPORAL', 'RECUPERACION')),
  id_cargo integer not null references "Cargo"(id_cargo),
  id_rol integer not null references "Rol"(id_rol)
);

create table if not exists "Codigo_Verificacion" (
  id_codigo serial primary key,
  codigo varchar(7) not null,
  expiracion timestamptz not null,
  activo boolean default true,
  id_usuario integer not null references "Usuario"(id_usuario)
);

create table if not exists "Auditoria" (
  id_auditoria serial primary key,
  fecha timestamptz not null,
  tipo varchar(15) not null check (tipo in ('INGRESO', 'SALIDA', 'CAMBIO_CLAVE')),
  id_usuario integer not null references "Usuario"(id_usuario)
);

-- ------------------------------------------------------------
-- Vehiculos de la empresa
-- ------------------------------------------------------------

-- Flota que el administrador registra; al crear un viaje solo se ofrecen los activos que no estan en otro viaje
create table if not exists "Vehiculo" (
  id_vehiculo serial primary key,
  placa varchar(20) not null unique,
  descripcion varchar(100),
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Viajes
-- ------------------------------------------------------------

create table if not exists "Viaje" (
  id_viaje serial primary key,
  motivo varchar(500) not null,
  origen text,
  destino varchar(200) not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  tipo varchar(15) not null check (tipo in ('Nacional', 'Internacional')),
  transporte text default 'Terrestre',
  placa_vehiculo varchar(20),
  -- vehiculo de la empresa usado en el viaje; placa_vehiculo guarda la placa que tenia en ese momento
  id_vehiculo integer references "Vehiculo"(id_vehiculo),
  -- monto_asignado es el fondo total; monto_combustible es la parte para combustible del vehiculo de la empresa
  monto_asignado decimal(10, 2) not null,
  monto_combustible numeric(10, 2) not null default 0,
  -- quien gestiona el hospedaje: la empresa lo reserva o el propio empleado
  gestion_hospedaje varchar(10) not null default 'Propio' check (gestion_hospedaje in ('Empresa', 'Propio')),
  monto_asignado_usd numeric(10, 2) default 0,
  estado varchar(25) not null default 'BORRADOR' constraint viaje_estado_check check (estado in (
    'BORRADOR', 'EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'EN_REVISION_TESORERO', 'EN_CURSO',
    'EN_REVISION', 'EN_REVISION_APROBADOR', 'APROBADO_SUPERVISOR', 'APROBADO_FINAL', 'RECHAZADO'
  )),
  fue_iniciado boolean default false,
  ciclo_revision integer not null default 1,
  tiene_alcohol boolean,
  -- numero de rendicion del mes para Oracle (10-40): lo asigna un trigger al quedar APROBADO_FINAL
  numero_rendicion integer,
  periodo_rendicion char(7),
  -- codigo VIA-numero/año: el numero vuelve a 1 cada año, lo asigna un trigger al crear el viaje
  numero_viaje integer,
  anio_viaje smallint,
  id_usuario integer not null,
  id_supervisor_asignado integer,
  id_aprobador_asignado integer,
  id_revisor_asignado integer,
  id_tesorero_asignado integer,
  -- Viaje tiene cinco claves foraneas hacia Usuario; el backend desambigua los
  -- embeds de PostgREST por nombre (Usuario!viaje_id_usuario_foreign), asi que
  -- estos nombres NO deben cambiarse.
  constraint viaje_id_usuario_foreign foreign key (id_usuario) references "Usuario"(id_usuario),
  constraint viaje_id_supervisor_asignado_foreign foreign key (id_supervisor_asignado) references "Usuario"(id_usuario),
  constraint viaje_id_aprobador_asignado_foreign foreign key (id_aprobador_asignado) references "Usuario"(id_usuario),
  constraint viaje_id_revisor_asignado_foreign foreign key (id_revisor_asignado) references "Usuario"(id_usuario),
  constraint viaje_id_tesorero_asignado_foreign foreign key (id_tesorero_asignado) references "Usuario"(id_usuario)
);

create table if not exists "Solicitud_Autorizacion_Plazo" (
  id_solicitud serial primary key,
  motivo varchar(500) not null,
  estado varchar(20) not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  observacion_revisor varchar(500),
  fecha_solicitud timestamptz default now(),
  fecha_respuesta timestamptz,
  id_viaje integer not null references "Viaje"(id_viaje) on delete cascade,
  id_empleado integer not null references "Usuario"(id_usuario),
  id_revisor integer references "Usuario"(id_usuario)
);

-- ------------------------------------------------------------
-- Gastos
-- ------------------------------------------------------------

create table if not exists "Gasto" (
  id_gasto serial primary key,
  monto_total decimal(10, 2) not null,
  fecha_gasto date not null,
  descripcion varchar(1000) not null,
  tipo char(1) not null check (tipo in ('F', 'R', 'C', 'S')),
  modificado boolean not null default false,
  es_gasto_internacional boolean default false,
  moneda varchar(10) default 'BOB',
  tipo_cambio numeric(10, 4) default 1, -- unidades de la moneda del gasto por 1 USD
  monto_moneda_origen numeric(10, 2) default 0,
  tipo_cambio_bs numeric(10, 4), -- bolivianos por 1 USD de un gasto internacional, para la planilla en Bs
  -- moneda en la que se rinde el gasto internacional (USD o BOB), elegida por el empleado; null toma la del fondo del viaje
  moneda_rendicion char(3) check (moneda_rendicion in ('USD', 'BOB')),
  base_imponible numeric(10, 2) default 0,
  retencion_rc_iva numeric(10, 2) default 0,
  retencion_iue numeric(10, 2) default 0,
  retencion_it numeric(10, 2) default 0,
  importe_costo numeric(10, 2) default 0,
  tiene_alcohol boolean not null default false,
  numero_recibo varchar(50), -- numero impreso del recibo en papel de un gasto sin factura, si lo tiene
  id_viaje integer not null references "Viaje"(id_viaje),
  id_categoria integer references "Categoria_Gasto"(id_categoria),
  id_proveedor integer references "Proveedor"(id_proveedor)
);

create table if not exists "Gasto_Subitem" (
  id_subitem serial primary key,
  descripcion varchar(255) not null,
  monto numeric(10, 2) not null,
  id_gasto integer not null references "Gasto"(id_gasto) on delete cascade
);

create table if not exists "Gasto_Tramo_Moneda" (
  id_tramo serial primary key,
  moneda varchar(10) not null,
  monto_origen numeric(12, 2) not null,
  tipo_cambio numeric(12, 4) not null,
  monto_usd numeric(12, 2) not null,
  id_gasto integer not null references "Gasto"(id_gasto) on delete cascade
);

create table if not exists "Imagen" (
  id_imagen serial primary key,
  url_archivo text not null,
  id_gasto integer not null references "Gasto"(id_gasto) unique
);

-- Respaldos extra de un gasto sin factura (por ejemplo, el comprobante del cambio de moneda); hasta 2 por gasto
create table if not exists "Imagen_Respaldo" (
  id_respaldo serial primary key,
  url_archivo text not null,
  id_gasto integer not null references "Gasto"(id_gasto) on delete cascade
);

-- ------------------------------------------------------------
-- Facturas
-- ------------------------------------------------------------

create table if not exists "Factura" (
  id_factura serial primary key,
  numero_factura varchar(50) not null,
  fecha_emision date not null,
  monto_parcial decimal(10, 2) not null,
  cuf varchar(100), -- codigo de autorizacion (CUF) que pide Oracle
  id_gasto integer not null references "Gasto"(id_gasto) unique,
  id_proveedor integer references "Proveedor"(id_proveedor),
  constraint factura_numero_proveedor_fecha_unique unique (numero_factura, fecha_emision, id_proveedor)
);

create table if not exists "Detalle_Factura" (
  id_detalle serial primary key,
  nombre_producto varchar(255) not null,
  cantidad numeric(12, 3) not null, -- hasta 3 decimales: litros, kilos o unidades
  precio numeric(12, 4) not null, -- precio unitario con hasta 4 decimales, como en el papel (por ejemplo 3.7456 Bs por litro)
  id_factura integer not null references "Factura"(id_factura)
);

create table if not exists "Factura_Impuestos" (
  id_factura integer not null references "Factura"(id_factura),
  id_impuesto integer not null references "Impuesto"(id_impuesto),
  primary key (id_factura, id_impuesto)
);

-- ------------------------------------------------------------
-- Comentarios / observaciones
-- ------------------------------------------------------------

create table if not exists "Comentario" (
  id_comentario serial primary key,
  descripcion varchar(300) not null,
  fecha timestamptz not null,
  tipo varchar(20) not null default 'OBSERVACION' check (tipo in ('JUSTIFICACION', 'OBSERVACION')),
  ciclo_revision integer,
  fecha_justificada date,
  id_usuario integer not null references "Usuario"(id_usuario),
  id_viaje integer not null references "Viaje"(id_viaje),
  -- Si se elimina el gasto, la observacion se conserva (queda como observacion general)
  id_gasto integer references "Gasto"(id_gasto) on delete set null
);

-- ------------------------------------------------------------
-- Contador de recibos
-- ------------------------------------------------------------

-- Ultimo numero de recibo emitido en cada mes (AAAA-MM): el correlativo vuelve a 1 cada mes
create table if not exists "Correlativo_Recibo" (
  periodo char(7) primary key,
  numero integer not null default 0
);

-- Ultimo numero de viaje asignado en cada año, para el codigo VIA-numero/año
create table if not exists "Correlativo_Viaje" (
  anio smallint primary key,
  numero integer not null default 0
);

-- Un vehiculo esta ocupado mientras su viaje se revisa o esta en curso; se libera cuando el empleado lo termina
create unique index if not exists viaje_vehiculo_ocupado_unique on "Viaje"(id_vehiculo)
where id_vehiculo is not null and estado in ('EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'EN_REVISION_TESORERO', 'EN_CURSO');

create unique index if not exists viaje_numero_anual_unique on "Viaje"(anio_viaje, numero_viaje) where numero_viaje is not null;

-- Ultimo numero de rendicion asignado en cada mes (AAAA-MM), para la descripcion de Oracle
create table if not exists "Correlativo_Rendicion" (
  periodo char(7) primary key,
  numero integer not null default 0
);

-- Seguro extra: dos rendiciones nunca comparten numero en el mismo mes
create unique index if not exists viaje_numero_rendicion_unique on "Viaje"(periodo_rendicion, numero_rendicion) where numero_rendicion is not null;

-- Numero de cada recibo emitido (por gasto o agrupado por viaje), para conservarlo al reenviar
create table if not exists "Recibo" (
  id_recibo serial primary key,
  numero integer not null,
  -- mes (AAAA-MM) del correlativo: el numero solo se repite entre meses distintos
  periodo char(7) not null,
  id_viaje integer not null references "Viaje"(id_viaje) on delete cascade,
  id_gasto integer references "Gasto"(id_gasto) on delete cascade,
  tipo char(1) not null check (tipo in ('C', 'S')),
  es_gasto_internacional boolean not null default false,
  -- el numero se asigna al registrar el gasto; enviado indica si el recibo ya se mando al empleado
  enviado boolean not null default false,
  fecha_emision timestamptz not null default now()
);

create unique index if not exists recibo_numero_periodo_unique on "Recibo"(periodo, numero);
create unique index if not exists recibo_individual_unique on "Recibo"(id_gasto) where id_gasto is not null;
create unique index if not exists recibo_agrupado_unique on "Recibo"(id_viaje, tipo, es_gasto_internacional) where id_gasto is null;

-- ------------------------------------------------------------
-- Historial de revision
-- ------------------------------------------------------------

-- Cada aprobacion o rechazo de un viaje por etapa; automatica cuando el revisor era el viajero
create table if not exists "Revision_Viaje" (
  id_revision serial primary key,
  id_viaje integer not null references "Viaje"(id_viaje) on delete cascade,
  id_usuario integer not null references "Usuario"(id_usuario),
  etapa varchar(20) not null check (etapa in ('REVISION_VIAJE', 'APROBACION_VIAJE', 'ASIGNACION_FONDOS', 'REVISION_GASTOS', 'REVISION_ALCOHOL', 'REVISION_FINAL')),
  accion varchar(10) not null check (accion in ('APROBADO', 'RECHAZADO')),
  automatica boolean not null default false,
  fecha timestamptz not null default now()
);

create index if not exists idx_revision_viaje_usuario_etapa on "Revision_Viaje"(id_usuario, etapa);
create index if not exists idx_revision_viaje_id_viaje on "Revision_Viaje"(id_viaje);

-- ------------------------------------------------------------
-- Indices para optimizacion de consultas
-- ------------------------------------------------------------

-- Usuarios y seguridad
create index if not exists idx_auditoria_id_usuario on "Auditoria"(id_usuario);
create index if not exists idx_codigo_verificacion_id_usuario on "Codigo_Verificacion"(id_usuario);
create index if not exists idx_usuario_jefe_directo on "Usuario"(id_jefe_directo);
create index if not exists idx_usuario_seccion on "Usuario"(id_seccion);

-- Viajes: filtrado por propietario, estado y asignacion
create index if not exists idx_viaje_id_usuario on "Viaje"(id_usuario);
create index if not exists idx_viaje_estado on "Viaje"(estado);
create index if not exists idx_viaje_supervisor on "Viaje"(id_supervisor_asignado);

-- Gastos y sus dependencias
create index if not exists idx_gasto_id_viaje on "Gasto"(id_viaje);
create index if not exists idx_gasto_subitem_id_gasto on "Gasto_Subitem"(id_gasto);
create index if not exists idx_gasto_tramo_id_gasto on "Gasto_Tramo_Moneda"(id_gasto);

-- Comentarios: por viaje y por gasto puntual
create index if not exists idx_comentario_id_viaje on "Comentario"(id_viaje);
create index if not exists idx_comentario_id_gasto on "Comentario"(id_gasto);

-- Facturas
create index if not exists idx_factura_id_gasto on "Factura"(id_gasto);
create index if not exists idx_detalle_factura_id_factura on "Detalle_Factura"(id_factura);

-- Solicitudes de autorizacion de plazo
create index if not exists idx_solicitud_id_viaje on "Solicitud_Autorizacion_Plazo"(id_viaje);
create index if not exists idx_solicitud_estado on "Solicitud_Autorizacion_Plazo"(estado);

-- ------------------------------------------------------------
-- Rendicion por terceros
-- ------------------------------------------------------------

create table if not exists "Solicitud_Reemplazo" (
  id_solicitud serial primary key,
  estado varchar(20) not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  observacion_revisor varchar(500),
  fecha_solicitud timestamptz default now(),
  fecha_respuesta timestamptz,
  id_viaje integer not null references "Viaje"(id_viaje) on delete cascade,
  id_solicitante integer not null,
  id_sustituto integer not null,
  id_revisor integer,
  constraint solicitud_reemplazo_solicitante_fkey foreign key (id_solicitante) references "Usuario"(id_usuario),
  constraint solicitud_reemplazo_sustituto_fkey foreign key (id_sustituto) references "Usuario"(id_usuario),
  constraint solicitud_reemplazo_revisor_fkey foreign key (id_revisor) references "Usuario"(id_usuario)
);

create index if not exists idx_reemplazo_id_viaje on "Solicitud_Reemplazo"(id_viaje);
create index if not exists idx_reemplazo_id_sustituto on "Solicitud_Reemplazo"(id_sustituto);
create index if not exists idx_reemplazo_estado on "Solicitud_Reemplazo"(estado);

-- ------------------------------------------------------------
-- Firmas dibujadas y documentos verificables
-- ------------------------------------------------------------

-- Firma dibujada en el momento de aprobar o enviar; no se reutiliza: cada aprobacion trae su propio trazo
create table if not exists "Firma" (
  id_firma serial primary key,
  id_viaje integer not null references "Viaje"(id_viaje) on delete cascade,
  -- MEMORANDUM: aprobador del viaje; PREPARADO: empleado al enviar la rendicion;
  -- JEFE: jefe directo o supervisor al aprobar la rendicion (Vo/ Bo Jefe de Area);
  -- GERENTE: aprobador al aprobar la revision adicional de la rendicion (Vo/ Bo Gerente de Area)
  etapa varchar(15) not null check (etapa in ('MEMORANDUM', 'PREPARADO', 'JEFE', 'GERENTE')),
  id_usuario integer not null references "Usuario"(id_usuario),
  imagen text, -- PNG en base64; vacio cuando la etapa se aprobo automaticamente
  automatica boolean not null default false,
  ip varchar(60),
  fecha timestamptz not null default now()
);

create index if not exists firma_viaje_etapa on "Firma"(id_viaje, etapa, fecha desc);

-- Cada PDF que genera el sistema lleva un codigo y un QR para comprobar que es autentico
create table if not exists "Documento_Emitido" (
  codigo char(12) primary key,
  tipo varchar(25) not null,
  id_viaje integer references "Viaje"(id_viaje) on delete cascade,
  id_gasto integer references "Gasto"(id_gasto) on delete set null,
  resumen jsonb not null default '{}'::jsonb, -- datos clave del documento al emitirlo, para compararlos con el papel
  fecha timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Configuracion del resumen de pendientes (una sola fila)
-- ------------------------------------------------------------

-- Dias (0 domingo a 6 sabado) y horas (HH:MM, hora Bolivia) del resumen de pendientes

create table if not exists "Configuracion_Recordatorio" (
  id smallint primary key default 1 check (id = 1),
  activo boolean not null default true,
  dias smallint[] not null default '{1,2,3,4,5}',
  horas text[] not null default '{08:00,12:00,16:00}',
  fecha_actualizacion timestamptz not null default now(),
  id_usuario_actualizacion integer references "Usuario"(id_usuario) on delete set null
);

-- >>>>> 02_funciones.sql

-- ============================================================
-- SCV · 02 FUNCIONES Y TRIGGERS
-- ============================================================
-- Correlativo de recibos por mes, número de viaje por año y número de rendición del mes.
-- Se corre después de 01_esquema.sql.
-- ============================================================

-- Incrementa y devuelve el correlativo de recibos del mes indicado (search_path fijo por seguridad)
drop function if exists incrementar_correlativo_recibo();
create or replace function incrementar_correlativo_recibo(p_periodo char(7))
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevo_numero integer;
begin
  insert into "Correlativo_Recibo" (periodo, numero) values (p_periodo, 1)
  on conflict (periodo) do update set numero = "Correlativo_Recibo".numero + 1
  returning numero into nuevo_numero;
  return nuevo_numero;
end;
$$;

-- Al crear el viaje se le da el siguiente numero de su año (hora de Bolivia), para el codigo VIA-numero/año
create or replace function asignar_numero_viaje()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.numero_viaje is null then
    new.anio_viaje := extract(year from (now() at time zone 'America/La_Paz'));
    insert into "Correlativo_Viaje" (anio, numero) values (new.anio_viaje, 1)
    on conflict (anio) do update set numero = "Correlativo_Viaje".numero + 1
    returning numero into new.numero_viaje;
  end if;
  return new;
end;
$$;

drop trigger if exists viaje_numero_anual on "Viaje";
create trigger viaje_numero_anual
before insert on "Viaje"
for each row execute function asignar_numero_viaje();

-- Al quedar aprobada del todo, la rendicion recibe el siguiente numero de su mes (el del ultimo comprobante)
create or replace function asignar_numero_rendicion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  periodo_viaje char(7);
begin
  if new.estado = 'APROBADO_FINAL' and new.numero_rendicion is null then
    select to_char(coalesce(max(coalesce(f.fecha_emision, g.fecha_gasto)), current_date), 'YYYY-MM')
    into periodo_viaje
    from "Gasto" g
    left join "Factura" f on f.id_gasto = g.id_gasto
    where g.id_viaje = new.id_viaje;
    insert into "Correlativo_Rendicion" (periodo, numero) values (periodo_viaje, 1)
    on conflict (periodo) do update set numero = "Correlativo_Rendicion".numero + 1
    returning numero into new.numero_rendicion;
    new.periodo_rendicion := periodo_viaje;
  end if;
  return new;
end;
$$;

drop trigger if exists viaje_numero_rendicion on "Viaje";
create trigger viaje_numero_rendicion
before update of estado on "Viaje"
for each row execute function asignar_numero_rendicion();

-- >>>>> 03_datos_iniciales.sql

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

-- >>>>> 04_seguridad_rls.sql

-- ============================================================
-- SCV · 04 SEGURIDAD (RLS)
-- ============================================================
-- Activa la seguridad por fila en todas las tablas: nadie con la llave pública lee ni escribe.
-- El backend usa la llave de servicio y no se ve afectado. Se corre después de 03_datos_iniciales.sql.
-- ============================================================

do $block$
declare
  table_name text;
  policy_record record;
  target_tables text[] := array[
    'Auditoria', 'Cargo', 'Categoria_Gasto', 'Codigo_Verificacion', 'Comentario',
    'Correlativo_Recibo', 'Correlativo_Rendicion', 'Correlativo_Viaje', 'Recibo', 'Revision_Viaje', 'Detalle_Factura', 'Factura', 'Factura_Impuestos', 'Gasto',
    'Gasto_Subitem', 'Gasto_Tramo_Moneda', 'Imagen', 'Imagen_Respaldo', 'Impuesto', 'Proveedor',
    'Rol', 'Seccion', 'Solicitud_Autorizacion_Plazo', 'Solicitud_Reemplazo', 'Usuario', 'Vehiculo', 'Viaje', 'Firma', 'Documento_Emitido', 'Configuracion_Recordatorio'
  ];
begin
  foreach table_name in array target_tables
  loop
    for policy_record in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
    end loop;

    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $block$;

-- La numeracion de recibos solo la usa el backend (service_role): nadie con la llave publica puede llamarla
do $block$
declare
  role_name text;
begin
  revoke execute on function public.incrementar_correlativo_recibo(char) from public;
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke execute on function public.incrementar_correlativo_recibo(char) from %I', role_name);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.incrementar_correlativo_recibo(char) to service_role;
  end if;
end $block$;

-- Verificacion: debe devolver 0 filas.
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'Auditoria', 'Cargo', 'Categoria_Gasto', 'Codigo_Verificacion', 'Comentario',
    'Correlativo_Recibo', 'Correlativo_Rendicion', 'Correlativo_Viaje', 'Recibo', 'Revision_Viaje', 'Detalle_Factura', 'Factura', 'Factura_Impuestos', 'Gasto',
    'Gasto_Subitem', 'Gasto_Tramo_Moneda', 'Imagen', 'Imagen_Respaldo', 'Impuesto', 'Proveedor',
    'Rol', 'Seccion', 'Solicitud_Autorizacion_Plazo', 'Solicitud_Reemplazo', 'Usuario', 'Vehiculo', 'Viaje', 'Firma', 'Documento_Emitido', 'Configuracion_Recordatorio'
  );

-- >>>>> 05_demo_usuarios_ficticios.sql

-- ============================================================
-- SCV · 05 DEMO CON USUARIOS FICTICIOS
-- ============================================================
-- Se corre después de 01 a 04 sobre una base recién creada (o tras mantenimiento/limpiar_datos.sql)
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

-- Tesoreria es un cargo unico que ya crea 03_datos_iniciales.sql; se reconoce por el nombre exacto del cargo
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
