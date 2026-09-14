const supabase = require('../../config/supabase')
const expenseSummaryService = require('./expenseSummaryService')
const tripCommentService = require('../trip/tripCommentService')
const emailService = require('../shared/emailService')
const hierarchyAssignmentService = require('../shared/hierarchyAssignmentService')

// Lista los viajes pendientes de revision previa
const getPendingTripReviews = async (supervisorId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd))')
    .eq('estado', 'EN_REVISION_VIAJE')
    .is('id_supervisor_asignado', null)
    .neq('id_usuario', supervisorId)
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
    const trips = await hierarchyAssignmentService.filterTripsByHierarchy(
      data || [], supervisorId, 'SUPERVISOR', (trip) => trip.id_usuario
    )
    return {trips}
  }
};

// Lista los viajes de revision previa asignados al supervisor
const getMyTripReviews = async (supervisorId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre, monto_diario, monto_diario_usd)), Comentario(*)')
    .eq('id_supervisor_asignado', supervisorId)
    .or('estado.eq.EN_CURSO,and(fue_iniciado.eq.false,estado.in.(EN_REVISION_VIAJE,APROBADO_VIAJE,EN_REVISION_TESORERO,RECHAZADO))')
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
    return {trips: data || []}
  }
};

// Toma un viaje para revision previa
const takeTripReview = async (tripId, supervisorId) => {
  const {data: trip} = await supabase.from('Viaje').select('estado, id_usuario, id_supervisor_asignado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.estado !== 'EN_REVISION_VIAJE') {
    return {error: 'Este viaje no está disponible para revisión', status: 400}
  }
  if (trip.id_usuario === supervisorId) {
    return {error: 'No puedes revisar tu propio viaje', status: 403}
  }
  if (trip.id_supervisor_asignado) {
    return {error: 'Este viaje ya fue tomado por otro supervisor', status: 409}
  }
  const {error} = await supabase.from('Viaje').update({id_supervisor_asignado: supervisorId}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Viaje tomado correctamente'}
  }
};

// Devuelve un viaje de revision previa
const returnTripReview = async (tripId, supervisorId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_supervisor_asignado, estado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_supervisor_asignado !== supervisorId) {
    return {error: 'No puedes devolver un viaje que no tomaste', status: 403}
  }
  if (trip.estado !== 'EN_REVISION_VIAJE') {
    return {error: 'No puedes devolver este viaje', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({id_supervisor_asignado: null}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Viaje devuelto correctamente'}
  }
};

// Obtiene el detalle de un viaje en revision previa
const getTripReviewDetail = async (tripId, supervisorId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd))')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message, status: 500}
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_supervisor_asignado && trip.id_supervisor_asignado !== supervisorId) {
    const {data: supervisor} = await supabase.from('Usuario').select('nombre, apellido_paterno').eq('id_usuario', trip.id_supervisor_asignado).single()
    return {error: `Este viaje está siendo revisado por ${supervisor?.nombre} ${supervisor?.apellido_paterno}`, status: 403}
  }
  const {data: comments} = await supabase
    .from('Comentario').select('*').eq('id_viaje', tripId).eq('id_usuario', supervisorId).order('fecha', {ascending: false})
  return {trip, comments: comments || []}
};

// Aprueba un viaje en revision previa
const approveTripReview = async (tripId, supervisorId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, id_supervisor_asignado, estado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === supervisorId) {
    return {error: 'No puedes aprobar tu propio viaje', status: 403}
  }
  if (trip.id_supervisor_asignado !== supervisorId) {
    return {error: 'No tienes permiso para aprobar este viaje', status: 403}
  }
  if (trip.estado !== 'EN_REVISION_VIAJE') {
    return {error: 'Este viaje no está en revisión previa', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({estado: 'APROBADO_VIAJE'}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    await hierarchyAssignmentService.assignNextReviewer(tripId, supervisorId, 'APROBADOR', 'id_aprobador_asignado')
    return {message: 'Viaje aprobado por supervisor correctamente'}
  }
};

// Rechaza un viaje en revision previa
const rejectTripReview = async (tripId, supervisorId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, id_supervisor_asignado, estado, ciclo_revision, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo)').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === supervisorId) {
    return {error: 'No puedes rechazar tu propio viaje', status: 403}
  }
  if (trip.id_supervisor_asignado !== supervisorId) {
    return {error: 'No tienes permiso para rechazar este viaje', status: 403}
  }
  if (trip.estado !== 'EN_REVISION_VIAJE') {
    return {error: 'Este viaje no está en revisión previa', status: 400}
  }
  const {data: existingComments} = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', tripId)
    .eq('id_usuario', supervisorId)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', trip.ciclo_revision || 1)
  if (!existingComments || existingComments.length === 0) {
    return {error: 'Debes agregar al menos una observación antes de rechazar', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({estado: 'RECHAZADO'}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    await emailService.sendRejectionNotice(trip.Usuario)
    return {message: 'Viaje rechazado correctamente'}
  }
};

// Anexa el resumen de gastos y alertas a una lista de viajes
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
      diasExcedidos: summary.exceededDays,
      desgloseDiario: summary.dailyBreakdown,
      excedeHoteles: summary.hotelExceeds || summary.hotelExceedsUsd,
      excedeTotal: summary.totalExceeds,
      excedeTotalUsd: summary.totalExceedsUsd,
      alertas: alerts,
      estadoRevision: reviewStatus,
    }
  })
};

// Lista los viajes pendientes de revision de gastos
const getPendingExpenseReviews = async (supervisorId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd)), Gasto(monto_total, es_gasto_internacional, fecha_gasto, Categoria_Gasto(nombre))')
    .eq('estado', 'EN_REVISION')
    .is('id_supervisor_asignado', null)
    .neq('id_usuario', supervisorId)
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
    const trips = await hierarchyAssignmentService.filterTripsByHierarchy(
      data || [], supervisorId, 'SUPERVISOR', (trip) => trip.id_usuario
    )
    return {trips: attachSummaryToTrips(trips)}
  }
};

// Lista los viajes de revision de gastos asignados al supervisor
const getMyExpenseReviews = async (supervisorId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre, monto_diario, monto_diario_usd)), Gasto(monto_total, es_gasto_internacional, fecha_gasto, Categoria_Gasto(nombre)), Comentario(*)')
    .eq('id_supervisor_asignado', supervisorId)
    .in('estado', ['EN_REVISION', 'APROBADO_SUPERVISOR', 'RECHAZADO'])
    .eq('fue_iniciado', true)
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
};

// Toma un viaje para revision de gastos
const takeExpenseReview = async (tripId, supervisorId) => {
  const {data: trip} = await supabase.from('Viaje').select('estado, id_usuario, id_supervisor_asignado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.estado !== 'EN_REVISION') {
    return {error: 'Este viaje no está en revisión de gastos', status: 400}
  }
  if (trip.id_usuario === supervisorId) {
    return {error: 'No puedes revisar tu propio viaje', status: 403}
  }
  if (trip.id_supervisor_asignado) {
    return {error: 'Este viaje ya fue tomado por otro supervisor', status: 409}
  }
  const {error} = await supabase.from('Viaje').update({id_supervisor_asignado: supervisorId}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Viaje tomado correctamente'}
  }
};

// Devuelve un viaje de revision de gastos
const returnExpenseReview = async (tripId, supervisorId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_supervisor_asignado, estado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_supervisor_asignado !== supervisorId) {
    return {error: 'No puedes devolver un viaje que no tomaste', status: 403}
  }
  if (trip.estado !== 'EN_REVISION') {
    return {error: 'No puedes devolver un viaje ya procesado', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({id_supervisor_asignado: null}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Viaje devuelto correctamente'}
  }
};

// Obtiene el detalle de un viaje en revision de gastos
const getExpenseReviewDetail = async (tripId, supervisorId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd))')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message, status: 500}
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_supervisor_asignado && trip.id_supervisor_asignado !== supervisorId) {
    const {data: supervisor} = await supabase.from('Usuario').select('nombre, apellido_paterno').eq('id_usuario', trip.id_supervisor_asignado).single()
    return {error: `Este viaje está siendo revisado por ${supervisor?.nombre} ${supervisor?.apellido_paterno}`, status: 403}
  }
  const {data: expenses} = await supabase
    .from('Gasto')
    .select('*, Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Categoria_Gasto(nombre), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Imagen(url_archivo), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto)')
    .eq('id_viaje', tripId)
  const {data: comments} = await supabase
    .from('Comentario').select('*').eq('id_viaje', tripId).eq('id_usuario', supervisorId).order('fecha', {ascending: false})
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
    exceededDays: summary.exceededDays,
    dailyBreakdown: summary.dailyBreakdown,
    hotelExceeds: summary.hotelExceeds || summary.hotelExceedsUsd,
    totalExceeds: summary.totalExceeds,
    totalExceedsUsd: summary.totalExceedsUsd,
    alerts,
  }
};

// Aprueba los gastos de un viaje
const approveExpenseReview = async (tripId, supervisorId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, id_supervisor_asignado, estado, tiene_alcohol').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === supervisorId) {
    return {error: 'No puedes aprobar tu propio viaje', status: 403}
  }
  if (trip.id_supervisor_asignado !== supervisorId) {
    return {error: 'No tienes permiso para aprobar este viaje', status: 403}
  }
  if (trip.estado !== 'EN_REVISION') {
    return {error: 'Este viaje no está en revisión de gastos', status: 400}
  }
  const nextState = trip.tiene_alcohol ? 'EN_REVISION_APROBADOR' : 'APROBADO_SUPERVISOR'
  const {error} = await supabase.from('Viaje').update({estado: nextState}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else if (trip.tiene_alcohol) {
    await hierarchyAssignmentService.assignNextReviewer(tripId, supervisorId, 'APROBADOR', 'id_aprobador_asignado')
    return {message: 'Gastos aprobados por supervisor, pasan a revisión adicional del aprobador por contener alcohol'}
  }
  else {
    await hierarchyAssignmentService.assignNextReviewer(tripId, supervisorId, 'REVISOR', 'id_revisor_asignado')
    return {message: 'Gastos aprobados por supervisor correctamente'}
  }
};

// Rechaza los gastos de un viaje
const rejectExpenseReview = async (tripId, supervisorId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, id_supervisor_asignado, estado, ciclo_revision, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo)').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === supervisorId) {
    return {error: 'No puedes rechazar tu propio viaje', status: 403}
  }
  if (trip.id_supervisor_asignado !== supervisorId) {
    return {error: 'No tienes permiso para rechazar este viaje', status: 403}
  }
  if (trip.estado !== 'EN_REVISION') {
    return {error: 'Este viaje no está en revisión de gastos', status: 400}
  }
  const {data: existingComments} = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', tripId)
    .eq('id_usuario', supervisorId)
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
};

module.exports = {
  getPendingTripReviews, getMyTripReviews, takeTripReview, returnTripReview, getTripReviewDetail, approveTripReview, rejectTripReview,
  getPendingExpenseReviews, getMyExpenseReviews, takeExpenseReview, returnExpenseReview, getExpenseReviewDetail, approveExpenseReview, rejectExpenseReview,
  addComment: tripCommentService.addTripComment,
  editComment: tripCommentService.editTripComment,
  deleteComment: tripCommentService.deleteTripComment,
};