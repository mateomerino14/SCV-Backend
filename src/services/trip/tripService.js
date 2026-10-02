const supabase = require('../../config/supabase')
const expenseSummaryService = require('../approval/expenseSummaryService')
const substitutionService = require('../approval/substitutionService')
const hierarchyAssignmentService = require('../shared/hierarchyAssignmentService')
const commentModerationService = require('../shared/commentModerationService')

const tripStateCategories = {
  draft: ['BORRADOR'],
  previous: ['EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'EN_REVISION_TESORERO'],
  expenses: ['EN_CURSO', 'EN_REVISION', 'EN_REVISION_APROBADOR', 'APROBADO_SUPERVISOR', 'APROBADO_FINAL'],
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
  const substitutions = await substitutionService.getActiveSubstitutions(userId)
  return {
    viajesBorrador: draftTrips || [],
    viajesEnCurso: currentTripsWithExpenses,
    viajesRecientes: recentTrips || [],
    viajesSustitucion: substitutions,
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
const getTripDetail = async (tripId, requesterId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, id_seccion, Seccion(nombre), Cargo(nombre, monto_diario, monto_diario_usd))')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message}
  }
  let esSustitucion = false
  if (requesterId && trip.id_usuario !== requesterId) {
    esSustitucion = await substitutionService.canActOnTrip(tripId, requesterId)
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
  const summary = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  return {
    viaje: trip,
    gastos: expenses || [],
    comentarios: comments || [],
    gastoAcumulado: summary.accumulatedExpense,
    gastoAcumuladoUsd: summary.accumulatedExpenseUsd,
    excedePresupuesto: summary.exceedsBudget,
    excedePresupuestoUsd: summary.exceedsBudgetUsd,
    diasExcedidos: summary.exceededDays,
    desgloseDiario: summary.dailyBreakdown,
    excedeHoteles: summary.hotelExceeds || summary.hotelExceedsUsd,
    hotelAcumulado: summary.hotelAccumulated,
    hotelAcumuladoUsd: summary.hotelAccumuladoUsd,
    excedeTotal: summary.totalExceeds,
    excedeTotalUsd: summary.totalExceedsUsd,
    esSustitucion,
  }
};

// Fecha YYYY-MM-DD que exista en el calendario (rechaza, por ejemplo, 2026-02-30)
const isValidDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) {
    return false
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}
const isValidAmount = (value) => value !== undefined && value !== null && value !== '' && !isNaN(parseFloat(value)) && parseFloat(value) >= 0

// Valida los datos de un viaje al crearlo o reeditarlo, con los mismos limites de la base
const validateTripData = (tripData) => {
  if (!tripData.motivo?.trim() || tripData.motivo.trim().length > 100) {
    return 'El motivo es requerido y no puede superar los 100 caracteres'
  }
  if (!tripData.destino?.trim() || tripData.destino.trim().length > 200) {
    return 'El destino es requerido y no puede superar los 200 caracteres'
  }
  if (tripData.origen && String(tripData.origen).length > 200) {
    return 'El origen no puede superar los 200 caracteres'
  }
  if (!['Nacional', 'Internacional'].includes(tripData.tipo)) {
    return 'El tipo de viaje debe ser Nacional o Internacional'
  }
  if (!isValidDate(tripData.fecha_inicio) || !isValidDate(tripData.fecha_fin)) {
    return 'Las fechas del viaje no son válidas'
  }
  if (tripData.fecha_fin < tripData.fecha_inicio) {
    return 'La fecha de fin no puede ser anterior a la fecha de inicio'
  }
  if (!isValidAmount(tripData.monto_asignado)) {
    return 'El monto asignado debe ser un número mayor o igual a cero'
  }
  if (tripData.monto_asignado_usd !== undefined && tripData.monto_asignado_usd !== null && tripData.monto_asignado_usd !== '' && !isValidAmount(tripData.monto_asignado_usd)) {
    return 'El monto asignado en USD debe ser un número mayor o igual a cero'
  }
  if (tripData.transporte && String(tripData.transporte).length > 50) {
    return 'El transporte no es válido'
  }
  return null
}

// Reedita un viaje en borrador o rechazado
const editTrip = async (tripId, userId, tripData) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('estado, id_usuario, ciclo_revision, fue_iniciado')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario !== userId) {
    return {error: 'No tienes permiso para editar este viaje', status: 403}
  }
  // Solo se reedita el viaje antes de iniciarlo; si se rechazo en la fase de gastos se
  // corrigen los gastos y se reenvia con "finalizar", sin volver a la aprobacion previa
  const isEditableRejection = trip.estado === 'RECHAZADO' && !trip.fue_iniciado
  if (trip.estado !== 'BORRADOR' && !isEditableRejection) {
    return {error: 'Solo puedes editar viajes en borrador o rechazados antes de iniciarse', status: 400}
  }
  const tripDataError = validateTripData(tripData)
  if (tripDataError) {
    return {error: tripDataError, status: 400}
  }
  if (tripData.transporte === 'Vehículo de Empresa' && !tripData.placa_vehiculo?.trim()) {
    return {error: 'La placa del vehículo es requerida', status: 400}
  }
  if (tripData.transporte === 'Vehículo de Empresa' && tripData.tipo === 'Internacional') {
    return {error: 'El vehículo de empresa solo está disponible para viajes nacionales', status: 400}
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
  const {data: updatedRows, error} = await supabase
    .from('Viaje')
    .update(updateData)
    .eq('id_viaje', tripId)
    .eq('estado', trip.estado)
    .select('id_viaje')
  if (error) {
    return {error: error.message, status: 500}
  }
  if (!updatedRows?.length) {
    return {error: 'El viaje cambió de estado mientras lo editabas. Actualiza la página.', status: 409}
  }
  let message = 'Borrador actualizado correctamente'
  if (wasRejected) {
    message = 'Viaje reeditado y reenviado a revisión correctamente'
    await hierarchyAssignmentService.assignNextReviewer(tripId, userId, 'SUPERVISOR', 'id_supervisor_asignado')
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
  const {data: updatedRows, error} = await supabase
    .from('Viaje')
    .update({estado: 'EN_REVISION_VIAJE'})
    .eq('id_viaje', tripId)
    .eq('estado', 'BORRADOR')
    .select('id_viaje')
  if (error) {
    return {error: error.message, status: 500}
  }
  // Un doble clic no debe asignar revisor dos veces
  if (!updatedRows?.length) {
    return {error: 'El viaje ya fue enviado a revisión. Actualiza la página.', status: 409}
  }
  await hierarchyAssignmentService.assignNextReviewer(tripId, userId, 'SUPERVISOR', 'id_supervisor_asignado')
  return {message: 'Viaje enviado a revisión correctamente'}
};

// Confirma la finalizacion de un viaje y lo envia a revision de gastos
const confirmCompletion = async (tripId, userId, justifications) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(Cargo(monto_diario, monto_diario_usd))')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario !== userId) {
    const canAct = await substitutionService.canActOnTrip(tripId, userId)
    if (!canAct) {
      return {error: 'No tienes permiso para finalizar este viaje', status: 403}
    }
  }
  // Un viaje rechazado antes de iniciarse (sin fondos asignados) no puede pasar a rendicion
  const isExpensePhaseRejection = trip.estado === 'RECHAZADO' && trip.fue_iniciado
  if (trip.estado !== 'EN_CURSO' && !isExpensePhaseRejection) {
    return {error: 'Solo puedes finalizar viajes en curso o rechazados en la fase de gastos', status: 400}
  }
  const justificationList = Array.isArray(justifications) ? justifications : []
  for (const item of justificationList) {
    if (item.descripcion && item.descripcion.length > 300) {
      return {error: 'Cada justificación no puede superar los 300 caracteres', status: 400}
    }
    if (item.descripcion && commentModerationService.containsForbiddenWords(item.descripcion)) {
      return {error: 'La justificación contiene palabras inapropiadas', status: 400}
    }
  }
  const {data: expenses} = await supabase
    .from('Gasto')
    .select('monto_total, fecha_gasto, es_gasto_internacional, Categoria_Gasto(nombre)')
    .eq('id_viaje', tripId)
  const summary = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  const providedDates = new Set(
    justificationList.filter((item) => item.fecha && item.descripcion?.trim()).map((item) => item.fecha)
  )
  const missingDay = summary.exceededDays.find((day) => !providedDates.has(day.fecha))
  if (missingDay) {
    return {error: `Debes justificar el exceso del día ${missingDay.fecha}`, status: 400}
  }
  const needsHotelJustification = summary.hotelExceeds || summary.hotelExceedsUsd
  const hotelJustification = justificationList.find((item) => !item.fecha)
  if (needsHotelJustification && !hotelJustification?.descripcion?.trim()) {
    return {error: 'Debes justificar el exceso en hoteles', status: 400}
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
  const currentCycle = updateData.ciclo_revision || trip.ciclo_revision || 1
  const commentsToInsert = justificationList
    .filter((item) => item.descripcion?.trim())
    .map((item) => ({
      descripcion: item.descripcion.trim(),
      fecha: new Date().toISOString(),
      fecha_justificada: item.fecha || null,
      id_usuario: userId,
      id_viaje: parseInt(tripId),
      tipo: 'JUSTIFICACION',
      ciclo_revision: currentCycle,
    }))
  // Primero se guardan las justificaciones: si fallan, el viaje no se envia sin ellas
  let insertedIds = []
  if (commentsToInsert.length > 0) {
    const {data: inserted, error: commentsError} = await supabase.from('Comentario').insert(commentsToInsert).select('id_comentario')
    if (commentsError) {
      return {error: 'No se pudieron guardar las justificaciones. Intenta nuevamente.', status: 500}
    }
    insertedIds = (inserted || []).map((row) => row.id_comentario)
  }
  // Se exige el mismo estado leido, para que un doble envio no reasigne revisores dos veces
  const {data: updatedRows, error: updateError} = await supabase
    .from('Viaje')
    .update(updateData)
    .eq('id_viaje', tripId)
    .eq('estado', trip.estado)
    .select('id_viaje')
  if (updateError || !updatedRows?.length) {
    if (insertedIds.length > 0) {
      await supabase.from('Comentario').delete().in('id_comentario', insertedIds)
    }
    if (updateError) {
      return {error: updateError.message, status: 500}
    }
    return {error: 'El viaje ya fue enviado a revisión. Actualiza la página.', status: 409}
  }
  await hierarchyAssignmentService.assignNextReviewer(tripId, trip.id_usuario, 'SUPERVISOR', 'id_supervisor_asignado')
  return {message: 'Viaje enviado a revisión de gastos correctamente'}
};

module.exports = {getDashboardData, getHistory, getTripDetail, editTrip, submitToReview, confirmCompletion, validateTripData};