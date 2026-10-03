-- ============================================================
-- LIMPIEZA COMPLETA PARA PRUEBAS
-- ============================================================
-- Borra usuarios, viajes, gastos, facturas, solicitudes y auditoria; conserva los catalogos
-- ADVERTENCIA: no se puede deshacer. Solo en pruebas, nunca en produccion
-- ============================================================

truncate table
  "Recibo",
  "Revision_Viaje",
  "Comentario",
  "Solicitud_Reemplazo",
  "Solicitud_Autorizacion_Plazo",
  "Factura_Impuestos",
  "Detalle_Factura",
  "Factura",
  "Imagen",
  "Gasto_Tramo_Moneda",
  "Gasto_Subitem",
  "Gasto",
  "Viaje",
  "Auditoria",
  "Codigo_Verificacion",
  "Proveedor",
  "Usuario"
restart identity cascade;

update "Correlativo_Recibo" set numero = 0;

-- La limpieza borra en cascada la configuracion de recordatorios: se repone la de fabrica
insert into "Configuracion_Recordatorio" (id) values (1)
on conflict (id) do nothing;
