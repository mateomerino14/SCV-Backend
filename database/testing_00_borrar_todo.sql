-- ============================================================
-- BORRA TODAS LAS TABLAS EXISTENTES (esquema completo desde cero)
-- ============================================================
-- ADVERTENCIA: borra toda la base, tablas incluidas, sin poder deshacerlo. Solo en pruebas
-- ============================================================

drop table if exists
  "Configuracion_Recordatorio",
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
  "Recibo",
  "Revision_Viaje",
  "Correlativo_Recibo"
cascade;
