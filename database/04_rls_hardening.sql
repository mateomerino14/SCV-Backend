-- ============================================================
-- Activacion de Row Level Security en todas las tablas
-- ============================================================
-- Activa RLS y elimina las politicas permisivas, dejando las tablas
-- en "denegar por defecto". No afecta al backend, que usa service_role.

do $block$
declare
  table_name text;
  policy_record record;
  target_tables text[] := array[
    'Auditoria', 'Cargo', 'Categoria_Gasto', 'Codigo_Verificacion', 'Comentario',
    'Correlativo_Recibo', 'Detalle_Factura', 'Factura', 'Factura_Impuestos', 'Gasto',
    'Gasto_Subitem', 'Gasto_Tramo_Moneda', 'Imagen', 'Impuesto', 'Proveedor',
    'Rol', 'Solicitud_Autorizacion_Plazo', 'Solicitud_Reemplazo', 'Usuario', 'Viaje'
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

-- Verificacion: debe devolver 0 filas.
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'Auditoria', 'Cargo', 'Categoria_Gasto', 'Codigo_Verificacion', 'Comentario',
    'Correlativo_Recibo', 'Detalle_Factura', 'Factura', 'Factura_Impuestos', 'Gasto',
    'Gasto_Subitem', 'Gasto_Tramo_Moneda', 'Imagen', 'Impuesto', 'Proveedor',
    'Rol', 'Solicitud_Autorizacion_Plazo', 'Solicitud_Reemplazo', 'Usuario', 'Viaje'
  );