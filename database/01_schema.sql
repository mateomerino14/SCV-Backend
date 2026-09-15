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

create table if not exists "Categoria_Gasto" (
  id_categoria serial primary key,
  nombre varchar(50) not null unique,
  requiere_comprobante boolean not null default true
);

create table if not exists "Impuesto" (
  id_impuesto serial primary key,
  nombre varchar(50) not null,
  porcentaje decimal(10, 2) not null
);

create table if not exists "Proveedor" (
  id_proveedor serial primary key,
  nombre varchar(50) not null,
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
  numero_seccion varchar(50),
  carnet_identidad varchar(20),
  ultima_cambio_contrasenia timestamptz default now(),
  refresh_token_invalido_desde timestamptz,
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
-- Viajes
-- ------------------------------------------------------------

create table if not exists "Viaje" (
  id_viaje serial primary key,
  motivo varchar(100) not null,
  origen text,
  destino varchar(200) not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  tipo varchar(15) not null check (tipo in ('Nacional', 'Internacional')),
  transporte text default 'Terrestre',
  placa_vehiculo varchar(20),
  monto_asignado decimal(10, 2) not null,
  monto_asignado_usd numeric(10, 2) default 0,
  estado varchar(25) not null default 'BORRADOR' check (estado in (
    'BORRADOR', 'EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'EN_REVISION_TESORERO', 'EN_CURSO',
    'EN_REVISION', 'EN_REVISION_APROBADOR', 'APROBADO_SUPERVISOR', 'APROBADO_FINAL', 'RECHAZADO'
  )),
  fue_iniciado boolean default false,
  ciclo_revision integer not null default 1,
  tiene_alcohol boolean,
  id_usuario integer not null references "Usuario"(id_usuario),
  id_supervisor_asignado integer references "Usuario"(id_usuario),
  id_aprobador_asignado integer references "Usuario"(id_usuario),
  id_revisor_asignado integer references "Usuario"(id_usuario),
  id_tesorero_asignado integer references "Usuario"(id_usuario)
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
  moneda varchar(10) default 'USD',
  tipo_cambio numeric(10, 4) default 1,
  monto_moneda_origen numeric(10, 2) default 0,
  base_imponible numeric(10, 2) default 0,
  retencion_rc_iva numeric(10, 2) default 0,
  retencion_iue numeric(10, 2) default 0,
  retencion_it numeric(10, 2) default 0,
  importe_costo numeric(10, 2) default 0,
  tiene_alcohol boolean not null default false,
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

-- ------------------------------------------------------------
-- Facturas
-- ------------------------------------------------------------

create table if not exists "Factura" (
  id_factura serial primary key,
  numero_factura varchar(50) not null,
  fecha_emision date not null,
  monto_parcial decimal(10, 2) not null,
  id_gasto integer not null references "Gasto"(id_gasto) unique,
  id_proveedor integer references "Proveedor"(id_proveedor),
  constraint factura_numero_proveedor_fecha_unique unique (numero_factura, fecha_emision, id_proveedor)
);

create table if not exists "Detalle_Factura" (
  id_detalle serial primary key,
  nombre_producto varchar(50) not null,
  cantidad numeric(10, 2) not null,
  precio decimal(10, 2) not null,
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
  id_gasto integer references "Gasto"(id_gasto) on delete cascade
);

-- ------------------------------------------------------------
-- Contador de recibos
-- ------------------------------------------------------------

create table if not exists "Correlativo_Recibo" (
  id serial primary key,
  numero integer not null default 0
);

insert into "Correlativo_Recibo" (numero)
select 0
where not exists (select 1 from "Correlativo_Recibo" where id = 1);

-- ------------------------------------------------------------
-- Indices para optimizacion de consultas
-- ------------------------------------------------------------

-- Usuarios y seguridad
create index if not exists idx_auditoria_id_usuario on "Auditoria"(id_usuario);
create index if not exists idx_codigo_verificacion_id_usuario on "Codigo_Verificacion"(id_usuario);
create index if not exists idx_usuario_jefe_directo on "Usuario"(id_jefe_directo);
create index if not exists idx_usuario_seccion on "Usuario"(numero_seccion);

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