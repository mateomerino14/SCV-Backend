const supabase = require('../../config/supabase')
const deadlineService = require('../shared/deadlineService')
const emailService = require('../shared/emailService')
const {escapeHtml} = require('../../utils/htmlEscape')
const substitutionService = require('./substitutionService')

const toleranceDays = 4
const boliviaOffsetHours = -4

// Formatea una fecha ISO a formato dia/mes/anio
const formatDate = (isoString) => {
  const [year, month, day] = isoString.split('-')
  return `${day}/${month}/${year}`
};

// Obtiene la fecha calendario actual en Bolivia
const getBoliviaToday = () => {
  const now = new Date()
  const boliviaTime = new Date(now.getTime() + boliviaOffsetHours * 60 * 60 * 1000)
  return boliviaTime.toISOString().split('T')[0]
};

// Convierte un timestamp UTC a la fecha calendario en Bolivia
const toBoliviaDate = (isoString) => {
  const date = new Date(isoString)
  const boliviaTime = new Date(date.getTime() + boliviaOffsetHours * 60 * 60 * 1000)
  return boliviaTime.toISOString().split('T')[0]
};

// Suma dias a una fecha en formato YYYY-MM-DD
const addDaysToDate = (dateStr, days) => {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
};

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

// Crea una solicitud de autorizacion de plazo para un viaje
const createRequest = async (tripId, employeeId, reason) => {
  if (!reason?.trim()) {
    return {error: 'Debes indicar el motivo del retraso', status: 400}
  }
  if (reason.length > 500) {
    return {error: 'El motivo no puede superar los 500 caracteres', status: 400}
  }
  const {data: trip} = await supabase
    .from('Viaje')
    .select('id_usuario, motivo, estado, fecha_inicio, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno)')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  // La puede pedir el titular o su reemplazo aprobado; la extension vale para el viaje
  if (!(await substitutionService.canActOnTrip(tripId, employeeId))) {
    return {error: 'No tienes permiso sobre este viaje', status: 403}
  }
  // Solo tiene sentido con el viaje en curso y el plazo de registro vencido (sin una
  // extension vigente): en otro caso el empleado ya puede registrar o no le corresponde
  if (trip.estado !== 'EN_CURSO') {
    return {error: 'Solo puedes pedir una extensión de plazo mientras el viaje está en curso', status: 400}
  }
  const deadline = await deadlineService.validateTripDeadline(tripId, trip.fecha_inicio)
  if (!deadline.requiereAutorizacion) {
    return {error: 'Todavía estás dentro del plazo para registrar gastos', status: 400}
  }
  const {data: existingRequest} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('id_solicitud')
    .eq('id_viaje', tripId)
    .eq('estado', 'PENDIENTE')
    .maybeSingle()
  if (existingRequest) {
    return {error: 'Ya existe una solicitud pendiente para este viaje', status: 400}
  }
  const {data: request, error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .insert({id_viaje: tripId, id_empleado: employeeId, motivo: reason.trim()})
    .select()
    .single()
  if (error) {
    return {error: error.message, status: 500}
  }
  try {
    const reviewers = await getActiveReviewers()
    const to = reviewers.map((reviewer) => ({email: reviewer.email_corporativo, name: `${reviewer.nombre} ${reviewer.apellido_paterno}`}))
    const employeeName = `${trip.Usuario?.nombre} ${trip.Usuario?.apellido_paterno}`
    let requesterText = `<strong>${escapeHtml(employeeName)}</strong>`
    if (trip.id_usuario !== employeeId) {
      const {data: requester} = await supabase.from('Usuario').select('nombre, apellido_paterno').eq('id_usuario', employeeId).single()
      requesterText = `<strong>${escapeHtml(`${requester?.nombre} ${requester?.apellido_paterno}`)}</strong>, en reemplazo de ${escapeHtml(employeeName)},`
    }
    const body = `
      ${emailService.emailParagraph(`${requesterText} solicita autorización para seguir registrando gastos fuera del plazo de tolerancia.`)}
      ${emailService.emailInfoBox([
        {label: 'Viaje', value: trip.motivo},
        {label: 'Motivo del retraso', value: reason.trim()},
      ])}
      ${emailService.emailParagraph('Ingresa al sistema para aprobar o rechazar esta solicitud.')}
      ${emailService.emailButton()}
    `
    const html = emailService.buildEmailLayout('Nueva solicitud de plazo', body)
    await emailService.sendEmail(to, `Solicitud de Autorización de Plazo — Viaje de ${trip.Usuario?.nombre}`, html)
  }
  catch (error) {
    console.warn('Error notificando revisores:', error.message)
  }
  return {request}
};

// Obtiene el estado de la ultima solicitud de un viaje
const getRequestStatus = async (tripId, employeeId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  // El plazo es del viaje: lo consultan el titular y su reemplazo aprobado
  if (!(await substitutionService.canActOnTrip(tripId, employeeId))) {
    return {error: 'No tienes permiso sobre este viaje', status: 403}
  }
  const {data, error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*')
    .eq('id_viaje', tripId)
    .order('fecha_solicitud', {ascending: false})
    .limit(1)
    .maybeSingle()
  if (error) {
    return {error: error.message, status: 500}
  }
  if (data && data.estado === 'APROBADA' && data.fecha_respuesta) {
    const approvalDate = toBoliviaDate(data.fecha_respuesta)
    const extendedLimitStr = addDaysToDate(approvalDate, toleranceDays)
    const today = getBoliviaToday()
    data.extension_vencida = today > extendedLimitStr
    data.limite_extendido = extendedLimitStr
  }
  return {request: data || null}
};


// Estado del viaje en el que una ampliacion de plazo todavia tiene sentido: mientras se registran gastos
const requestableTripStates = ['EN_CURSO']
const autoCloseObservation = 'Cerrada automáticamente: el viaje ya se envió a revisión antes de que se respondiera la solicitud.'

// Destinatarios de la respuesta: quien pidio la extension y el titular del viaje (sin repetir)
const getRequestRecipients = (request) => {
  const people = [request.Solicitante, request.Viaje?.Usuario].filter((person) => person?.email_corporativo)
  return people.filter((person, index) => people.findIndex((other) => other.id_usuario === person.id_usuario) === index)
};

const requesterName = (request) => `${request.Solicitante?.nombre || ''} ${request.Solicitante?.apellido_paterno || ''}`.trim()

// Mensaje para quien intenta atender una solicitud que ya no esta pendiente
const describeProcessedRequest = (request) => {
  if (request?.estado === 'APROBADA') {
    return 'Esta solicitud ya fue aprobada.'
  }
  if (request?.estado === 'RECHAZADA' && !request.id_revisor) {
    return 'El empleado ya envió el viaje a revisión, así que esta solicitud se cerró automáticamente.'
  }
  return 'Esta solicitud ya fue rechazada.'
};

// Vuelve a leer la solicitud cuando otra accion se adelanto, para explicar que paso
const processedRequestError = async (requestId) => {
  const {data} = await supabase.from('Solicitud_Autorizacion_Plazo').select('estado, id_revisor').eq('id_solicitud', requestId).maybeSingle()
  return {error: describeProcessedRequest(data), status: 409}
};

// Cierra las solicitudes pendientes de esos viajes (por ejemplo, al enviarse el viaje a
// revision): ya no tienen sentido y no deben quedar en la bandeja del revisor
const closePendingRequests = async (tripIds) => {
  const ids = (tripIds || []).map((tripId) => parseInt(tripId)).filter((tripId) => !isNaN(tripId))
  if (ids.length === 0) {
    return
  }
  const {error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .update({estado: 'RECHAZADA', observacion_revisor: autoCloseObservation, fecha_respuesta: new Date().toISOString()})
    .in('id_viaje', ids)
    .eq('estado', 'PENDIENTE')
  if (error) {
    console.warn('No se pudieron cerrar las solicitudes pendientes:', error.message)
  }
};

// Lista las solicitudes pendientes de revision
const getPendingRequests = async () => {
  const {data, error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*, Solicitante:Usuario!id_empleado(id_usuario, nombre, apellido_paterno), Viaje(id_viaje, id_usuario, estado, motivo, origen, destino, fecha_inicio, fecha_fin, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, Cargo(nombre)))')
    .eq('estado', 'PENDIENTE')
    .order('fecha_solicitud', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  // Las de viajes que ya pasaron a revision se cierran y no se muestran
  const requests = data || []
  const staleTripIds = requests.filter((request) => !requestableTripStates.includes(request.Viaje?.estado)).map((request) => request.id_viaje)
  await closePendingRequests(staleTripIds)
  return {requests: requests.filter((request) => requestableTripStates.includes(request.Viaje?.estado))}
};

// Lista el historial de solicitudes ya procesadas
const getRequestHistory = async () => {
  const {data, error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*, Solicitante:Usuario!id_empleado(id_usuario, nombre, apellido_paterno), Viaje(id_viaje, id_usuario, motivo, origen, destino, fecha_inicio, fecha_fin, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, Cargo(nombre)))')
    .in('estado', ['APROBADA', 'RECHAZADA'])
    .order('fecha_respuesta', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  else {
    return {requests: data || []}
  }
};

// Aprueba una solicitud de autorizacion de plazo
const approveRequest = async (requestId, reviewerId) => {
  const {data: request} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*, Solicitante:Usuario!id_empleado(id_usuario, nombre, apellido_paterno, email_corporativo), Viaje(estado, motivo, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo))')
    .eq('id_solicitud', requestId)
    .single()
  if (!request) {
    return {error: 'Solicitud no encontrada', status: 404}
  }
  if (request.estado !== 'PENDIENTE') {
    return {error: describeProcessedRequest(request), status: 409}
  }
  if (!requestableTripStates.includes(request.Viaje?.estado)) {
    await closePendingRequests([request.id_viaje])
    return {error: describeProcessedRequest({estado: 'RECHAZADA', id_revisor: null}), status: 409}
  }
  const responseDate = new Date()
  const {data: updatedRequests, error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .update({estado: 'APROBADA', id_revisor: reviewerId, fecha_respuesta: responseDate.toISOString()})
    .eq('id_solicitud', requestId)
    .eq('estado', 'PENDIENTE')
    .select('id_solicitud')
  if (error) {
    return {error: error.message, status: 500}
  }
  // Otra persona la resolvio entre la lectura y esta accion
  if (!updatedRequests?.length) {
    return processedRequestError(requestId)
  }
  try {
    // Se avisa a quien pidio la extension y, si fue su reemplazo, tambien al titular del viaje
    for (const employee of getRequestRecipients(request)) {
      const ownRequest = employee.id_usuario === request.id_empleado
      const approvalDate = toBoliviaDate(responseDate.toISOString())
      const startDateStr = formatDate(approvalDate)
      const limitStr = formatDate(addDaysToDate(approvalDate, toleranceDays))
      const body = `
        ${emailService.emailParagraph(`Hola <strong>${escapeHtml(employee.nombre)}</strong>,`)}
        ${emailService.emailParagraph(ownRequest ? 'Tu solicitud para seguir registrando gastos fuera del plazo fue aprobada.' : `La solicitud de plazo que hizo <strong>${escapeHtml(requesterName(request))}</strong> para tu viaje fue aprobada.`)}
        ${emailService.emailInfoBox([{label: 'Viaje', value: request.Viaje?.motivo}])}
        ${emailService.emailHighlightBox('Nuevo plazo para registrar', `${startDateStr} — ${limitStr}`)}
        ${emailService.emailNote('Si necesitas más tiempo después de esa fecha, deberás solicitar una nueva autorización.')}
        ${emailService.emailButton()}
      `
      const html = emailService.buildEmailLayout('Autorización de plazo aprobada', body)
      await emailService.sendEmail([{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}], `Autorización Aprobada — ${request.Viaje?.motivo}`, html)
    }
  }
  catch (error) {
    console.warn('Error notificando al empleado:', error.message)
  }
  return {message: 'Solicitud aprobada correctamente'}
};

// Rechaza una solicitud de autorizacion de plazo
const rejectRequest = async (requestId, reviewerId, observation) => {
  if (!observation?.trim()) {
    return {error: 'Debes indicar el motivo del rechazo', status: 400}
  }
  if (observation.length > 500) {
    return {error: 'La observación no puede superar los 500 caracteres', status: 400}
  }
  const {data: request} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*, Solicitante:Usuario!id_empleado(id_usuario, nombre, apellido_paterno, email_corporativo), Viaje(estado, motivo, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo))')
    .eq('id_solicitud', requestId)
    .single()
  if (!request) {
    return {error: 'Solicitud no encontrada', status: 404}
  }
  if (request.estado !== 'PENDIENTE') {
    return {error: describeProcessedRequest(request), status: 409}
  }
  if (!requestableTripStates.includes(request.Viaje?.estado)) {
    await closePendingRequests([request.id_viaje])
    return {error: describeProcessedRequest({estado: 'RECHAZADA', id_revisor: null}), status: 409}
  }
  const {data: updatedRequests, error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .update({estado: 'RECHAZADA', id_revisor: reviewerId, observacion_revisor: observation.trim(), fecha_respuesta: new Date().toISOString()})
    .eq('id_solicitud', requestId)
    .eq('estado', 'PENDIENTE')
    .select('id_solicitud')
  if (error) {
    return {error: error.message, status: 500}
  }
  // Otra persona la resolvio entre la lectura y esta accion
  if (!updatedRequests?.length) {
    return processedRequestError(requestId)
  }
  try {
    // Se avisa a quien pidio la extension y, si fue su reemplazo, tambien al titular del viaje
    for (const employee of getRequestRecipients(request)) {
      const ownRequest = employee.id_usuario === request.id_empleado
      const body = `
        ${emailService.emailParagraph(`Hola <strong>${escapeHtml(employee.nombre)}</strong>,`)}
        ${emailService.emailParagraph(ownRequest ? 'Tu solicitud de autorización de plazo fue rechazada.' : `La solicitud de plazo que hizo <strong>${escapeHtml(requesterName(request))}</strong> para tu viaje fue rechazada.`)}
        ${emailService.emailInfoBox([{label: 'Viaje', value: request.Viaje?.motivo}])}
        ${emailService.emailHighlightBox('Motivo del rechazo', observation.trim())}
        ${emailService.emailNote('Si consideras que hubo un error, comunícate con tu revisor asignado.')}
      `
      const html = emailService.buildEmailLayout('Autorización de plazo rechazada', body)
      await emailService.sendEmail([{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}], `Autorización Rechazada — ${request.Viaje?.motivo}`, html)
    }
  }
  catch (error) {
    console.warn('Error notificando al empleado:', error.message)
  }
  return {message: 'Solicitud rechazada correctamente'}
};

module.exports = {closePendingRequests, requestableTripStates, createRequest, getRequestStatus, getPendingRequests, getRequestHistory, approveRequest, rejectRequest};