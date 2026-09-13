-- ------------------------------------------------------------
-- Migracion: estado intermedio EN_REVISION_APROBADOR
-- Se agrega cuando la rendicion contiene alcohol: pasa por el
-- aprobador antes de llegar al revisor final.
-- Ejecutar una sola vez sobre la base de datos existente
-- ------------------------------------------------------------

do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'Viaje' and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%estado%'
  limit 1;

  if existing_constraint is not null then
    execute format('alter table "Viaje" drop constraint %I', existing_constraint);
  end if;

  alter table "Viaje" add constraint viaje_estado_check check (estado in (
    'BORRADOR', 'EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'EN_REVISION_TESORERO', 'EN_CURSO',
    'EN_REVISION', 'EN_REVISION_APROBADOR', 'APROBADO_SUPERVISOR', 'APROBADO_FINAL', 'RECHAZADO'
  ));
end $$;
