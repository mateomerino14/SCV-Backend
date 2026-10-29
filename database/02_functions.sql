-- ============================================================
-- Funciones usadas por el backend via supabase.rpc()
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
