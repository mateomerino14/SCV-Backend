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
-- Configuracion del resumen de pendientes (una sola fila)
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
-- Dias (0 domingo a 6 sabado) y horas (HH:MM, hora Bolivia) del resumen de pendientes

create table if not exists "Configuracion_Recordatorio" (
  id smallint primary key default 1 check (id = 1),
  activo boolean not null default true,
  dias smallint[] not null default '{1,2,3,4,5}',
  horas text[] not null default '{08:00,12:00,16:00}',
  fecha_actualizacion timestamptz not null default now(),
  id_usuario_actualizacion integer references "Usuario"(id_usuario) on delete set null
);
