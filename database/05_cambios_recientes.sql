-- =====================================================================
-- Cambios recientes para bases existentes (octubre 2026)
-- Ya incluidos en 01_schema.sql; solo para bases creadas antes, se puede correr mas de una vez
-- =====================================================================

-- 1) Motivo del cambio de contrasena pendiente: TEMPORAL o RECUPERACION
alter table "Usuario" add column if not exists motivo_cambio_contrasenia varchar(15)
  check (motivo_cambio_contrasenia in ('TEMPORAL', 'RECUPERACION'));
update "Usuario" set motivo_cambio_contrasenia = 'TEMPORAL'
where debe_cambiar_contrasenia = true and motivo_cambio_contrasenia is null;

-- 2) Al eliminar un gasto, sus observaciones se conservan (quedan como observacion general)
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where con.conrelid = '"Comentario"'::regclass and con.contype = 'f' and att.attname = 'id_gasto';
  if constraint_name is not null then
    execute format('alter table "Comentario" drop constraint %I', constraint_name);
  end if;
  alter table "Comentario"
    add constraint comentario_id_gasto_fkey foreign key (id_gasto) references "Gasto"(id_gasto) on delete set null;
end $$;

-- 3) Los gastos en bolivianos se guardan con moneda BOB
alter table "Gasto" alter column moneda set default 'BOB';

-- 4) Correccion de datos guardados antes de los ultimos arreglos
-- Gastos con factura o recibo guardados con costo en 0: el costo es el monto completo
update "Gasto"
set base_imponible = monto_total, importe_costo = monto_total, monto_moneda_origen = monto_total,
    retencion_rc_iva = 0, retencion_iue = 0, retencion_it = 0
where tipo in ('F', 'R') and coalesce(importe_costo, 0) = 0;

-- Gastos en bolivianos que quedaron marcados con moneda USD
update "Gasto" set moneda = 'BOB' where coalesce(es_gasto_internacional, false) = false and moneda = 'USD';
