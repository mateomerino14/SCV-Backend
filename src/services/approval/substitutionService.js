const supabase = require('../../config/supabase')
const emailService = require('../shared/emailService')

// Obtiene los revisores activos con correo corporativo
const getActiveReviewers = async () => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, email_corporativo, activo, Rol!inner(nombre)')
    .eq('activo', true)
    .eq('Rol.nombre', 'REVISOR')
  if (error) {
    return []
  }
  else {
    return (data || []).filter((user) => user.email_corporativo && user.email_corporativo.trim() !== '')
  }
};

// Crea una solicitud para que otra persona rinda los gastos de un viaje
const createRequest = async (tripId, requesterId, substituteId) => {
  if (!substituteId) {
    return {error: 'Debes seleccionar quién rendirá por ti', status: 400}
  }
  if (parseInt(substituteId) === requesterId) {
    return {error: 'No puedes designarte a ti mismo como sustituto', status: 400}
  }
  const {data: trip} = await supabase
    .from('Viaje')
    .select('id_usuario, motivo, estado, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno)')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario !== requesterId) {
    return {error: 'No tienes permiso sobre este viaje', status: 403}
  }
  if (trip.estado !== 'EN_CURSO' && trip.estado !== 'RECHAZADO') {
    return {error: 'Solo puedes solicitar un reemplazo mientras el viaje está en curso o rechazado', status: 400}
  }
  const {data: substitute} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, activo, email_corporativo')
    .eq('id_usuario', substituteId)
    .single()
  if (!substitute || !substitute.activo) {
    return {error: 'El usuario seleccionado no está disponible', status: 400}
  }
  const {data: existingRequest} = await supabase
    .from('Solicitud_Reemplazo')
    .select('id_solicitud')
    .eq('id_viaje', tripId)
    .eq('estado', 'PENDIENTE')
    .maybeSingle()
  if (existingRequest) {
    return {error: 'Ya existe una solicitud de reemplazo pendiente para este viaje', status: 400}
  }
  const {data: request, error} = await supabase
    .from('Solicitud_Reemplazo')
    .insert({id_viaje: tripId, id_solicitante: requesterId, id_sustituto: substituteId})
    .select()
    .single()
  if (error) {
    return {error: error.message, status: 500}
  }
  try {
    const reviewers = await getActiveReviewers()
    const to = reviewers.map((reviewer) => ({email: reviewer.email_corporativo, name: `${reviewer.nombre} ${reviewer.apellido_paterno}`}))
    const employeeName = `${trip.Usuario?.nombre} ${trip.Usuario?.apellido_paterno}`
    const substituteName = `${substitute.nombre} ${substitute.apellido_paterno}`
    const body = `
      <p>Hola,</p>
      <p><strong>${employeeName}</strong> solicita que <strong>${substituteName}</strong> rinda los gastos de su viaje <strong>${trip.motivo}</strong> en su nombre.</p>
      <p>Ingresa al sistema para aprobar o rechazar esta solicitud.</p>
    `
    const html = emailService.buildEmailLayout('Nueva solicitud de reemplazo', body, '#870002')
    await emailService.sendEmail(to, `Solicitud de Reemplazo — Viaje de ${employeeName}`, html)
  }
  catch (emailError) {
    console.warn('Error notificando revisores:', emailError.message)
  }
  return {request}
};

// Obtiene el estado de la ultima solicitud de reemplazo de un viaje
const getRequestStatus = async (tripId, requesterId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario !== requesterId) {
    return {error: 'No tienes permiso sobre este viaje', status: 403}
  }
  const {data, error} = await supabase
    .from('Solicitud_Reemplazo')
    .select('*, Sustituto:Usuario!solicitud_reemplazo_sustituto_fkey(nombre, apellido_paterno)')
    .eq('id_viaje', tripId)
    .order('fecha_solicitud', {ascending: false})
    .limit(1)
    .maybeSingle()
  if (error) {
    return {error: error.message, status: 500}
  }
  return {request: data || null}
};

// Lista las solicitudes de reemplazo pendientes de revision
const getPendingRequests = async () => {
  const {data, error} = await supabase
    .from('Solicitud_Reemplazo')
    .select('*, Viaje(id_viaje, motivo, origen, destino, fecha_inicio, fecha_fin, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, Cargo(nombre))), Sustituto:Usuario!solicitud_reemplazo_sustituto_fkey(nombre, apellido_paterno)')
    .eq('estado', 'PENDIENTE')
    .order('fecha_solicitud', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  else {
    return {requests: data || []}
  }
};

// Lista el historial de solicitudes de reemplazo ya procesadas
const getRequestHistory = async () => {
  const {data, error} = await supabase
    .from('Solicitud_Reemplazo')
    .select('*, Viaje(id_viaje, motivo, origen, destino, fecha_inicio, fecha_fin, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, Cargo(nombre))), Sustituto:Usuario!solicitud_reemplazo_sustituto_fkey(nombre, apellido_paterno)')
    .in('estado', ['APROBADA', 'RECHAZADA'])
    .order('fecha_respuesta', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  else {
    return {requests: data || []}
  }
};

// Aprueba una solicitud de reemplazo
const approveRequest = async (requestId, reviewerId) => {
  const {data: request} = await supabase
    .from('Solicitud_Reemplazo')
    .select('*, Viaje(motivo, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo)), Sustituto:Usuario!solicitud_reemplazo_sustituto_fkey(nombre, apellido_paterno, email_corporativo)')
    .eq('id_solicitud', requestId)
    .single()
  if (!request) {
    return {error: 'Solicitud no encontrada', status: 404}
  }
  if (request.estado !== 'PENDIENTE') {
    return {error: 'Esta solicitud ya fue procesada', status: 400}
  }
  const {error} = await supabase
    .from('Solicitud_Reemplazo')
    .update({estado: 'APROBADA', id_revisor: reviewerId, fecha_respuesta: new Date().toISOString()})
    .eq('id_solicitud', requestId)
  if (error) {
    return {error: error.message, status: 500}
  }
  try {
    const employee = request.Viaje?.Usuario
    const substitute = request.Sustituto
    const substituteName = `${substitute?.nombre} ${substitute?.apellido_paterno}`
    const employeeName = `${employee?.nombre} ${employee?.apellido_paterno}`
    if (employee?.email_corporativo) {
      const body = `
        <p>Tu solicitud para que <strong>${substituteName}</strong> rinda los gastos de tu viaje <strong>${request.Viaje?.motivo}</strong> fue aprobada.</p>
      `
      const html = emailService.buildEmailLayout('Reemplazo aprobado', body, '#155724')
      await emailService.sendEmail([{email: employee.email_corporativo, name: employeeName}], `Reemplazo Aprobado — ${request.Viaje?.motivo}`, html)
    }
    if (substitute?.email_corporativo) {
      const body = `
        <p>Fuiste designado para rendir los gastos del viaje <strong>${request.Viaje?.motivo}</strong> de <strong>${employeeName}</strong>.</p>
        <p>Ingresa al sistema para registrar los gastos correspondientes.</p>
      `
      const html = emailService.buildEmailLayout('Nueva rendición asignada', body, '#155724')
      await emailService.sendEmail([{email: substitute.email_corporativo, name: substituteName}], `Rendición de ${employeeName} — ${request.Viaje?.motivo}`, html)
    }
  }
  catch (emailError) {
    console.warn('Error notificando el reemplazo aprobado:', emailError.message)
  }
  return {message: 'Solicitud aprobada correctamente'}
};

// Rechaza una solicitud de reemplazo
const rejectRequest = async (requestId, reviewerId, observation) => {
  if (!observation?.trim()) {
    return {error: 'Debes indicar el motivo del rechazo', status: 400}
  }
  if (observation.length > 500) {
    return {error: 'La observación no puede superar los 500 caracteres', status: 400}
  }
  const {data: request} = await supabase
    .from('Solicitud_Reemplazo')
    .select('*, Viaje(motivo, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo))')
    .eq('id_solicitud', requestId)
    .single()
  if (!request) {
    return {error: 'Solicitud no encontrada', status: 404}
  }
  if (request.estado !== 'PENDIENTE') {
    return {error: 'Esta solicitud ya fue procesada', status: 400}
  }
  const {error} = await supabase
    .from('Solicitud_Reemplazo')
    .update({estado: 'RECHAZADA', id_revisor: reviewerId, observacion_revisor: observation.trim(), fecha_respuesta: new Date().toISOString()})
    .eq('id_solicitud', requestId)
  if (error) {
    return {error: error.message, status: 500}
  }
  try {
    const employee = request.Viaje?.Usuario
    if (employee?.email_corporativo) {
      const body = `
        <p>Tu solicitud de reemplazo para el viaje <strong>${request.Viaje?.motivo}</strong> fue rechazada.</p>
        <p><strong>Motivo:</strong> ${observation.trim()}</p>
      `
      const html = emailService.buildEmailLayout('Reemplazo rechazado', body, '#D20F12')
      await emailService.sendEmail([{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}], `Reemplazo Rechazado — ${request.Viaje?.motivo}`, html)
    }
  }
  catch (emailError) {
    console.warn('Error notificando el rechazo del reemplazo:', emailError.message)
  }
  return {message: 'Solicitud rechazada correctamente'}
};

// Lista los viajes en los que el usuario es sustituto aprobado
const getActiveSubstitutions = async (substituteId) => {
  const {data, error} = await supabase
    .from('Solicitud_Reemplazo')
    .select('id_viaje, Viaje(*, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno))')
    .eq('id_sustituto', substituteId)
    .eq('estado', 'APROBADA')
  if (error) {
    return []
  }
  const activeTrips = (data || []).filter((row) => row.Viaje && ['EN_CURSO', 'RECHAZADO'].includes(row.Viaje.estado))
  return Promise.all(activeTrips.map(async (row) => {
    const {data: expenses} = await supabase
      .from('Gasto')
      .select('monto_total, es_gasto_internacional')
      .eq('id_viaje', row.Viaje.id_viaje)
    const gastoAcumulado = (expenses || [])
      .filter((expense) => !expense.es_gasto_internacional)
      .reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
    const gastoAcumuladoUsd = (expenses || [])
      .filter((expense) => !!expense.es_gasto_internacional)
      .reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
    return {
      ...row.Viaje,
      esSustitucion: true,
      nombreTitular: `${row.Viaje.Usuario?.nombre} ${row.Viaje.Usuario?.apellido_paterno}`,
      gastoAcumulado,
      gastoAcumuladoUsd,
    }
  }))
};

// Verifica si un usuario puede operar sobre un viaje: es el titular o su sustituto aprobado
const canActOnTrip = async (tripId, userId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario').eq('id_viaje', tripId).single()
  if (!trip) {
    return false
  }
  if (trip.id_usuario === userId) {
    return true
  }
  const {data: approvedSubstitution} = await supabase
    .from('Solicitud_Reemplazo')
    .select('id_solicitud')
    .eq('id_viaje', tripId)
    .eq('id_sustituto', userId)
    .eq('estado', 'APROBADA')
    .maybeSingle()
  return !!approvedSubstitution
}

// Verifica si un usuario puede registrar, editar o eliminar gastos de un viaje:
// debe ser el titular o su sustituto aprobado, y el viaje debe estar en fase de gastos
const canRegisterExpenseOnTrip = async (tripId, userId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, estado, fue_iniciado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {allowed: false, error: 'Viaje no encontrado', status: 404}
  }
  const isOwner = trip.id_usuario === userId
  let isSubstitute = false
  if (!isOwner) {
    const {data: approvedSubstitution} = await supabase
      .from('Solicitud_Reemplazo')
      .select('id_solicitud')
      .eq('id_viaje', tripId)
      .eq('id_sustituto', userId)
      .eq('estado', 'APROBADA')
      .maybeSingle()
    isSubstitute = !!approvedSubstitution
  }
  if (!isOwner && !isSubstitute) {
    return {allowed: false, error: 'No tienes permiso sobre este viaje', status: 403}
  }
  const isExpensePhase = trip.estado === 'EN_CURSO' || (trip.estado === 'RECHAZADO' && !!trip.fue_iniciado)
  if (!isExpensePhase) {
    return {allowed: false, error: 'Este viaje no está en fase de registro de gastos', status: 400}
  }
  return {allowed: true, trip}
};

module.exports = {
  createRequest,
  getRequestStatus,
  getPendingRequests,
  getRequestHistory,
  approveRequest,
  rejectRequest,
  getActiveSubstitutions,
  canActOnTrip,
  canRegisterExpenseOnTrip,
};
