-- ============================================================
-- Funciones usadas por el backend via supabase.rpc()
-- ============================================================

-- Incrementa y devuelve el correlativo de recibos (search_path fijo por seguridad)
create or replace function incrementar_correlativo_recibo()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevo_numero integer;
begin
  update "Correlativo_Recibo"
  set numero = numero + 1
  where id = 1
  returning numero into nuevo_numero;
  return nuevo_numero;
end;
$$;

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
