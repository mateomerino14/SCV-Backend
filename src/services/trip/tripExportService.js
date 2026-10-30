const supabase = require('../../config/supabase');
const tripAccessService = require('./tripAccessService');
const signatureService = require('../shared/signatureService');

const maxTripsPerExport = 50;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const exportRoles = ['ADMINISTRADOR', 'REVISOR'];
const tripColumns = '*, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, apellido_materno, codigo_dependencia, Jefe:id_jefe_directo(codigo_dependencia), Seccion(nombre, codigo_seccion), Cargo(nombre, monto_diario, monto_diario_usd)), Recibo(numero, periodo, tipo, es_gasto_internacional, id_gasto)';
const expenseColumns = '*, Categoria_Gasto(nombre), Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Factura(numero_factura, fecha_emision, monto_parcial, cuf, Detalle_Factura(nombre_producto, cantidad, precio)), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto), Recibo(numero, periodo)';

// Convierte la lista de ids recibida ("1,2,3") en numeros validos y sin repetir
const parseTripIds = (idsText) => [...new Set(String(idsText || '').split(',').map((id) => parseInt(id, 10)).filter((id) => id > 0))];

// Indica si el usuario puede exportar varias planillas: administrador, revisor o tesorero
const canExportStatements = async (userId) => {
  const requester = await tripAccessService.getRequester(userId);
  return exportRoles.includes(requester?.Rol?.nombre) || tripAccessService.isTreasurer(requester);
};

// Ids de los viajes con fondos entregados cuyo inicio cae en el periodo
const findTripIdsByPeriod = async (startDate, endDate) => {
  const {data} = await supabase
    .from('Viaje')
    .select('id_viaje')
    .eq('fue_iniciado', true)
    .gte('fecha_inicio', startDate)
    .lte('fecha_inicio', endDate)
    .order('fecha_inicio', {ascending: true})
    .limit(maxTripsPerExport + 1);
  return (data || []).map((trip) => trip.id_viaje);
};

// Reune viaje, gastos y justificaciones de varios viajes (por ids o por periodo) para exportarlos a Excel
const getStatementsForExport = async (query, userId) => {
  let tripIds = parseTripIds(query.ids);
  if (!query.ids && datePattern.test(query.fecha_inicio || '') && datePattern.test(query.fecha_fin || '')) {
    tripIds = await findTripIdsByPeriod(query.fecha_inicio, query.fecha_fin);
    if (tripIds.length === 0) {
      return {statements: []};
    }
  }
  if (tripIds.length === 0) {
    return {error: 'Indica al menos un viaje para exportar', status: 400};
  }
  if (tripIds.length > maxTripsPerExport) {
    return {error: `Puedes exportar como máximo ${maxTripsPerExport} viajes a la vez; filtra un periodo más corto`, status: 400};
  }
  if (!(await canExportStatements(userId))) {
    return {error: 'No tienes permiso para exportar planillas de varios viajes', status: 403};
  }
  const [{data: trips, error: tripsError}, {data: expenses, error: expensesError}, {data: comments}] = await Promise.all([
    supabase.from('Viaje').select(tripColumns).in('id_viaje', tripIds),
    supabase.from('Gasto').select(expenseColumns).in('id_viaje', tripIds).order('fecha_gasto', {ascending: true}).order('id_gasto', {ascending: true}),
    supabase.from('Comentario').select('id_viaje, descripcion, fecha_justificada, tipo, fecha').in('id_viaje', tripIds).eq('tipo', 'JUSTIFICACION').order('fecha', {ascending: false}),
  ]);
  if (tripsError || expensesError) {
    return {error: (tripsError || expensesError).message, status: 500};
  }
  const statements = tripIds
    .map((tripId) => (trips || []).find((trip) => trip.id_viaje === tripId))
    .filter(Boolean)
    .map((trip) => ({
      viaje: trip,
      gastos: (expenses || []).filter((expense) => expense.id_viaje === trip.id_viaje),
      comentarios: (comments || []).filter((comment) => comment.id_viaje === trip.id_viaje),
    }));
  // Cada planilla lleva las firmas de sus tres casilleros para el Excel
  for (const statement of statements) {
    statement.firmas = await signatureService.statementSignaturesForExport(statement.viaje.id_viaje);
  }
  return {statements};
};

module.exports = {getStatementsForExport, parseTripIds};
