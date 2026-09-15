-- ============================================================
-- LIMPIEZA COMPLETA PARA PRUEBAS
-- ============================================================
-- Borra TODOS los usuarios, viajes, gastos, facturas, comentarios,
-- solicitudes y auditoria. Reinicia los contadores de ID a 1.
-- NO toca los catalogos (Rol, Cargo, Categoria_Gasto, Impuesto),
-- ya que esos son datos de referencia, no datos de prueba.
--
-- ADVERTENCIA: esto borra todo sin posibilidad de deshacer.
-- Usar solo en un entorno de pruebas, nunca en produccion.
-- ============================================================

truncate table
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
