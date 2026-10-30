-- ============================================================
-- SCV · MANTENIMIENTO · BORRAR TODO
-- ============================================================
-- Elimina todas las tablas, funciones y triggers del sistema para volver a crear la base
-- con 01 a 05. ADVERTENCIA: no se puede deshacer. Nunca en una base con datos reales.
-- ============================================================

drop table if exists
  "Configuracion_Recordatorio",
  "Comentario",
  "Solicitud_Reemplazo",
  "Solicitud_Autorizacion_Plazo",
  "Factura_Impuestos",
  "Detalle_Factura",
  "Factura",
  "Imagen_Respaldo",
  "Imagen",
  "Gasto_Tramo_Moneda",
  "Gasto_Subitem",
  "Gasto",
  "Firma",
  "Documento_Emitido",
  "Viaje",
  "Vehiculo",
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
  "Correlativo_Rendicion",
  "Correlativo_Viaje",
  "Revision_Viaje",
  "Correlativo_Recibo"
cascade;

-- Funciones y triggers (los triggers se van con sus tablas)
drop function if exists incrementar_correlativo_recibo(char);
drop function if exists incrementar_correlativo_recibo();
drop function if exists asignar_numero_viaje();
drop function if exists asignar_numero_rendicion();
