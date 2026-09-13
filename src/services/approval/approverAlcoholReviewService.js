const supabase = require('../../config/supabase')
const expenseSummaryService = require('./expenseSummaryService')
const tripCommentService = require('../trip/tripCommentService')
const emailService = require('../shared/emailService')
const dependencyAssignmentService = require('../shared/dependencyAssignmentService')

// Agrega el resumen de gastos a una lista de viajes
const attachSummaryToTrips = (trips) => {
  return trips.map((trip) => {
    const summary = expenseSummaryService.calculateExpenseSummary(trip.Gasto, trip)
    const {alerts, reviewStatus} = expenseSummaryService.buildReviewAlerts(summary, trip)
    return {
      ...trip,
      gastoAcumulado: summary.accumulatedExpense,
      gastoAcumuladoUsd: summary.accumulatedExpenseUsd,
      excedePresupuesto: summary.exceedsBudget,
      excedePresupuestoUsd: summary.exceedsBudgetUsd,
      alertas: alerts,
      estadoRevision: reviewStatus,
    }
  })
}

// Lista los viajes pendientes de revision adicional del aprobador por contener alcohol
const getPendingAlcoholReviews = async (approverId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_dependencia, Cargo(nombre)), Gasto(monto_total, es_gasto_internacional)')
    .eq('estado', 'EN_REVISION_APROBADOR')
    .is('id_aprobador_asignado', null)
    .neq('id_usuario', approverId)
  if (filters.fecha_inicio) {
    query = query.gte('fecha_inicio', filters.fecha_inicio)
  }
  if (filters.fecha_fin) {
    query = query.lte('fecha_fin', filters.fecha_fin)
  }
  if (filters.id_empleado) {
    query = query.eq('id_usuario', filters.id_empleado)
  }
  const {data, error} = await query.order('fecha_inicio', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  const [requesterDependency, dependenciesWithRole] = await Promise.all([
    dependencyAssignmentService.getUserDependency(approverId),
    dependencyAssignmentService.getDependenciesWithRole('APROBADOR'),
  ])
  const trips = dependencyAssignmentService.filterTripsByDependency(data || [], requesterDependency, dependenciesWithRole)
  return {trips: attachSummaryToTrips(trips)}
}

// Lista los viajes de revision adicional asignados al aprobador
const getMyAlcoholReviews = async (approverId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_dependencia, Cargo(nombre)), Gasto(monto_total, es_gasto_internacional)')
    .eq('id_aprobador_asignado', approverId)
    .in('estado', ['EN_REVISION_APROBADOR', 'APROBADO_SUPERVISOR', 'APROBADO_FINAL', 'RECHAZADO'])
    .eq('tiene_alcohol', true)
  if (filters.fecha_inicio) {
    query = query.gte('fecha_inicio', filters.fecha_inicio)
  }
  if (filters.fecha_fin) {
    query = query.lte('fecha_fin', filters.fecha_fin)
  }
  if (filters.id_empleado) {
    query = query.eq('id_usuario', filters.id_empleado)
  }
  const {data, error} = await query.order('fecha_inicio', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  else {
    return {trips: attachSummaryToTrips(data || [])}
  }
}

// Toma un viaje para revision adicional por alcohol
const takeAlcoholReview = async (tripId, approverId) => {
  const {data: trip} = await supabase.from('Viaje').select('estado, id_usuario, id_aprobador_asignado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.estado !== 'EN_REVISION_APROBADOR') {
    return {error: 'Este viaje no está en revisión adicional del aprobador', status: 400}
  }
  if (trip.id_usuario === approverId) {
    return {error: 'No puedes revisar tu propio viaje', status: 403}
  }
  if (trip.id_aprobador_asignado) {
    return {error: 'Este viaje ya fue tomado por otro aprobador', status: 409}
  }
  const {error} = await supabase.from('Viaje').update({id_aprobador_asignado: approverId}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Viaje tomado correctamente'}
  }
}

// Devuelve un viaje de revision adicional por alcohol
const returnAlcoholReview = async (tripId, approverId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_aprobador_asignado, estado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_aprobador_asignado !== approverId) {
    return {error: 'No puedes devolver un viaje que no tomaste', status: 403}
  }
  if (trip.estado !== 'EN_REVISION_APROBADOR') {
    return {error: 'No puedes devolver un viaje ya procesado', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({id_aprobador_asignado: null}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Viaje devuelto correctamente'}
  }
}

// Obtiene el detalle de un viaje en revision adicional por alcohol
const getAlcoholReviewDetail = async (tripId, approverId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message, status: 500}
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_aprobador_asignado && trip.id_aprobador_asignado !== approverId) {
    const {data: approver} = await supabase.from('Usuario').select('nombre, apellido_paterno').eq('id_usuario', trip.id_aprobador_asignado).single()
    return {error: `Este viaje está siendo revisado por ${approver?.nombre} ${approver?.apellido_paterno}`, status: 403}
  }
  const {data: expenses} = await supabase
    .from('Gasto')
    .select('*, Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Categoria_Gasto(nombre), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Imagen(url_archivo), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto)')
    .eq('id_viaje', tripId)
  const {data: comments} = await supabase
    .from('Comentario').select('*').eq('id_viaje', tripId).eq('id_usuario', approverId).order('fecha', {ascending: false})
  const summary = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  const {alerts} = expenseSummaryService.buildReviewAlerts(summary, trip)
  return {
    trip,
    expenses: expenses || [],
    comments: comments || [],
    accumulatedExpense: summary.accumulatedExpense,
    accumulatedExpenseUsd: summary.accumulatedExpenseUsd,
    exceedsBudget: summary.exceedsBudget,
    exceedsBudgetUsd: summary.exceedsBudgetUsd,
    alerts,
  }
}

// Aprueba la revision adicional del aprobador, continuando el flujo hacia el revisor final
const approveAlcoholReview = async (tripId, approverId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, id_aprobador_asignado, estado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === approverId) {
    return {error: 'No puedes aprobar tu propio viaje', status: 403}
  }
  if (trip.id_aprobador_asignado !== approverId) {
    return {error: 'No tienes permiso para aprobar este viaje', status: 403}
  }
  if (trip.estado !== 'EN_REVISION_APROBADOR') {
    return {error: 'Este viaje no está en revisión adicional del aprobador', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({estado: 'APROBADO_SUPERVISOR'}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Revisión adicional aprobada, la rendición pasa al revisor final'}
  }
}

// Rechaza la revision adicional del aprobador
const rejectAlcoholReview = async (tripId, approverId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, id_aprobador_asignado, estado, ciclo_revision, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo)').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === approverId) {
    return {error: 'No puedes rechazar tu propio viaje', status: 403}
  }
  if (trip.id_aprobador_asignado !== approverId) {
    return {error: 'No tienes permiso para rechazar este viaje', status: 403}
  }
  if (trip.estado !== 'EN_REVISION_APROBADOR') {
    return {error: 'Este viaje no está en revisión adicional del aprobador', status: 400}
  }
  const {data: existingComments} = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', tripId)
    .eq('id_usuario', approverId)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', trip.ciclo_revision || 1)
    .not('id_gasto', 'is', null)
  if (!existingComments || existingComments.length === 0) {
    return {error: 'Debes agregar al menos una observación a algún gasto antes de rechazar', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({estado: 'RECHAZADO'}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    await emailService.sendRejectionNotice(trip.Usuario)
    return {message: 'Viaje rechazado correctamente'}
  }
}

module.exports = {
  getPendingAlcoholReviews,
  getMyAlcoholReviews,
  takeAlcoholReview,
  returnAlcoholReview,
  getAlcoholReviewDetail,
  approveAlcoholReview,
  rejectAlcoholReview,
  addComment: tripCommentService.addTripComment,
  editComment: tripCommentService.editTripComment,
  deleteComment: tripCommentService.deleteTripComment,
}
