-- ============================================================
-- BORRA TODAS LAS TABLAS EXISTENTES (esquema completo desde cero)
-- ============================================================
-- ADVERTENCIA: esto borra TODA la base de datos, tablas incluidas,
-- no solo los datos. No se puede deshacer. Usar solo en un entorno
-- de pruebas, nunca en produccion con datos reales.
-- ============================================================

drop table if exists
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
  "Usuario",
  "Proveedor",
  "Impuesto",
  "Categoria_Gasto",
  "Seccion",
  "Cargo",
  "Rol",
  "Correlativo_Recibo"
cascade;
