-- ============================================================
-- Activacion de Row Level Security en todas las tablas
-- ============================================================
-- Deja las tablas en denegar por defecto; el backend usa service_role y no se ve afectado

do $block$
declare
  table_name text;
  policy_record record;
  target_tables text[] := array[
    'Auditoria', 'Cargo', 'Categoria_Gasto', 'Codigo_Verificacion', 'Comentario',
    'Correlativo_Recibo', 'Correlativo_Rendicion', 'Correlativo_Viaje', 'Recibo', 'Revision_Viaje', 'Detalle_Factura', 'Factura', 'Factura_Impuestos', 'Gasto',
    'Gasto_Subitem', 'Gasto_Tramo_Moneda', 'Imagen', 'Imagen_Respaldo', 'Impuesto', 'Proveedor',
    'Rol', 'Seccion', 'Solicitud_Autorizacion_Plazo', 'Solicitud_Reemplazo', 'Usuario', 'Viaje', 'Configuracion_Recordatorio'
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
    'Rol', 'Seccion', 'Solicitud_Autorizacion_Plazo', 'Solicitud_Reemplazo', 'Usuario', 'Viaje', 'Configuracion_Recordatorio'
  );