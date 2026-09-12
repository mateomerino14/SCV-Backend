const supabase = require('../../config/supabase')
const commentModerationService = require('../shared/commentModerationService')

const tripStateCategories = {
  draft: ['BORRADOR'],
  previous: ['EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'EN_REVISION_TESORERO'],
  expenses: ['EN_CURSO', 'EN_REVISION', 'APROBADO_SUPERVISOR', 'APROBADO_FINAL'],
}

// Obtiene los datos del dashboard de un usuario: borradores, viajes en curso y recientes
const getDashboardData = async (userId) => {
  const {data: draftTrips} = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_usuario', userId)
    .eq('estado', 'BORRADOR')
    .order('fecha_inicio', {ascending: false})
  const {data: currentTrips} = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_usuario', userId)
    .eq('estado', 'EN_CURSO')
    .order('fecha_inicio', {ascending: false})
  const currentTripsWithExpenses = await Promise.all(
    (currentTrips || []).map(async (trip) => {
      const {data: expenses} = await supabase
        .from('Gasto')
        .select('monto_total, es_gasto_internacional')
        .eq('id_viaje', trip.id_viaje)
      const accumulatedExpense = (expenses || [])
        .filter((expense) => !expense.es_gasto_internacional)
        .reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
      const accumulatedExpenseUsd = (expenses || [])
        .filter((expense) => !!expense.es_gasto_internacional)
        .reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
      return {...trip, gastoAcumulado: accumulatedExpense, gastoAcumuladoUsd: accumulatedExpenseUsd}
    })
  )
  const {data: recentTrips, error: recentError} = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_usuario', userId)
    .neq('estado', 'EN_CURSO')
    .neq('estado', 'BORRADOR')
    .order('fecha_inicio', {ascending: false})
    .limit(15)
  if (recentError) {
    return {error: recentError.message}
  }
  return {
    viajesBorrador: draftTrips || [],
    viajesEnCurso: currentTripsWithExpenses,
    viajesRecientes: recentTrips || [],
  }
};

// Obtiene el historial de viajes de un usuario, paginado y filtrado por estado
const getHistory = async (userId, page, limit, filter) => {
  const pageNum = Math.max(1, parseInt(page))
  const limitNum = Math.max(1, Math.min(100, parseInt(limit)))
  const from = (pageNum - 1) * limitNum
  const to = from + limitNum - 1
  let query = supabase
    .from('Viaje')
    .select('*', {count: 'exact'})
    .eq('id_usuario', userId)
  if (filter === 'RECHAZADO_PREVIO') {
    query = query.eq('estado', 'RECHAZADO').eq('fue_iniciado', false)
  }
  else if (filter === 'RECHAZADO_GASTOS') {
    query = query.eq('estado', 'RECHAZADO').eq('fue_iniciado', true)
  }
  else if (filter === 'PREVIO') {
    query = query.or(`estado.in.(${tripStateCategories.previous.join(',')}),and(estado.eq.RECHAZADO,fue_iniciado.eq.false)`)
  }
  else if (filter === 'GASTOS') {
    query = query.or(`estado.in.(${tripStateCategories.expenses.join(',')}),and(estado.eq.RECHAZADO,fue_iniciado.eq.true)`)
  }
  else if (filter !== 'TODOS') {
    query = query.eq('estado', filter)
  }
  const {data, error, count} = await query
    .order('fecha_inicio', {ascending: false})
    .range(from, to)
  if (error) {
    return {error: error.message}
  }
  return {viajes: data || [], total: count || 0, pagina: pageNum, limite: limitNum}
};

// Obtiene el detalle completo de un viaje, con sus gastos y comentarios
const getTripDetail = async (tripId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message}
  }
  const {data: expenses, error: expensesError} = await supabase
    .from('Gasto')
    .select('*, Categoria_Gasto(nombre), Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Imagen(url_archivo), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto)')
    .eq('id_viaje', tripId)
  if (expensesError) {
    return {error: expensesError.message}
  }
  const {data: comments} = await supabase
    .from('Comentario')
    .select('*')
    .eq('id_viaje', tripId)
    .order('fecha', {ascending: false})
  return {viaje: trip, gastos: expenses || [], comentarios: comments || []}
};

// Reedita un viaje en borrador o rechazado
const editTrip = async (tripId, userId, tripData) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('estado, id_usuario, ciclo_revision')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario !== userId) {
    return {error: 'No tienes permiso para editar este viaje', status: 403}
  }
  if (trip.estado !== 'RECHAZADO' && trip.estado !== 'BORRADOR') {
    return {error: 'Solo puedes editar viajes en borrador o rechazados', status: 400}
  }
  if (tripData.transporte === 'Vehículo de Empresa' && !tripData.placa_vehiculo?.trim()) {
    return {error: 'La placa del vehículo es requerida', status: 400}
  }
  const updateData = {
    motivo: tripData.motivo,
    origen: tripData.origen || null,
    destino: tripData.destino,
    fecha_inicio: tripData.fecha_inicio,
    fecha_fin: tripData.fecha_fin,
    tipo: tripData.tipo,
    transporte: tripData.transporte || 'Terrestre',
    placa_vehiculo: tripData.transporte === 'Vehículo de Empresa' ? tripData.placa_vehiculo.trim() : null,
    monto_asignado: tripData.monto_asignado,
    monto_asignado_usd: tripData.monto_asignado_usd || 0,
  }
  const wasRejected = trip.estado === 'RECHAZADO'
  if (wasRejected) {
    updateData.estado = 'EN_REVISION_VIAJE'
    updateData.id_supervisor_asignado = null
    updateData.id_aprobador_asignado = null
    updateData.id_revisor_asignado = null
    updateData.id_tesorero_asignado = null
    updateData.ciclo_revision = (trip.ciclo_revision || 1) + 1
  }
  const {error} = await supabase
    .from('Viaje')
    .update(updateData)
    .eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  let message = 'Borrador actualizado correctamente'
  if (wasRejected) {
    message = 'Viaje reeditado y reenviado a revisión correctamente'
  }
  return {message}
};

// Envia un viaje en borrador a revision
const submitToReview = async (tripId, userId) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('estado, id_usuario')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario !== userId) {
    return {error: 'No tienes permiso sobre este viaje', status: 403}
  }
  if (trip.estado !== 'BORRADOR') {
    return {error: 'Solo puedes enviar a revisión un viaje que esté en borrador', status: 400}
  }
  const {error} = await supabase
    .from('Viaje')
    .update({estado: 'EN_REVISION_VIAJE'})
    .eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  return {message: 'Viaje enviado a revisión correctamente'}
};

// Confirma la finalizacion de un viaje y lo envia a revision de gastos
const confirmCompletion = async (tripId, userId, justification) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario !== userId) {
    return {error: 'No tienes permiso para finalizar este viaje', status: 403}
  }
  if (trip.estado !== 'EN_CURSO' && trip.estado !== 'RECHAZADO') {
    return {error: 'Solo puedes finalizar viajes en curso o rechazados (en fase de gastos)', status: 400}
  }
  if (justification && commentModerationService.containsForbiddenWords(justification)) {
    return {error: 'La justificación contiene palabras inapropiadas', status: 400}
  }
  const wasRejected = trip.estado === 'RECHAZADO'
  const updateData = {
    estado: 'EN_REVISION',
    id_supervisor_asignado: null,
    id_aprobador_asignado: null,
    id_revisor_asignado: null,
  }
  if (wasRejected) {
    updateData.ciclo_revision = (trip.ciclo_revision || 1) + 1
  }
  const {error: updateError} = await supabase
    .from('Viaje')
    .update(updateData)
    .eq('id_viaje', tripId)
  if (updateError) {
    return {error: updateError.message, status: 500}
  }
  if (justification) {
    await supabase.from('Comentario').insert({
      descripcion: justification,
      fecha: new Date().toISOString(),
      id_usuario: userId,
      id_viaje: parseInt(tripId),
      tipo: 'JUSTIFICACION',
      ciclo_revision: updateData.ciclo_revision || trip.ciclo_revision || 1,
    })
  }
  return {message: 'Viaje enviado a revisión de gastos correctamente'}
};

module.exports = {getDashboardData, getHistory, getTripDetail, editTrip, submitToReview, confirmCompletion};