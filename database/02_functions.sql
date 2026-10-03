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