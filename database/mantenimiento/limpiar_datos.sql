-- ============================================================
-- SCV · MANTENIMIENTO · LIMPIAR DATOS
-- ============================================================
-- Borra usuarios, viajes, gastos, facturas, firmas, documentos, solicitudes y auditoría;
-- conserva los catálogos (roles, cargos, secciones, categorías, impuestos y vehículos).
-- ADVERTENCIA: no se puede deshacer. Nunca en una base con datos reales.
-- ============================================================

truncate table
  "Recibo",
  "Firma",
  "Documento_Emitido",
  "Correlativo_Rendicion",
  "Correlativo_Recibo",
  "Correlativo_Viaje",
  "Revision_Viaje",
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
  "Viaje",
  "Auditoria",
  "Codigo_Verificacion",
  "Proveedor",
  "Usuario"
restart identity cascade;

-- La limpieza borra en cascada la configuracion de recordatorios: se repone la de fabrica
insert into "Configuracion_Recordatorio" (id) values (1)
on conflict (id) do nothing;
