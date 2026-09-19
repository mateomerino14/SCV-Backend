const supabase = require('../../config/supabase')
const emailService = require('../shared/emailService')

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
    .select('id_usuario, motivo, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno)')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario !== employeeId) {
    return {error: 'No tienes permiso sobre este viaje', status: 403}
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
    const body = `
      <p style="color: #2e2827; font-size: 14px; margin: 0 0 16px 0;">
        <strong>${employeeName}</strong> solicita autorización para seguir registrando gastos fuera del plazo de tolerancia.
      </p>
      <div style="background-color: #F3F6FF; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <p style="color: #475569; font-size: 11px; text-transform: uppercase; font-weight: bold; margin: 0 0 4px 0;">Viaje</p>
        <p style="color: #2e2827; font-size: 14px; margin: 0 0 12px 0;">${trip.motivo}</p>
        <p style="color: #475569; font-size: 11px; text-transform: uppercase; font-weight: bold; margin: 0 0 4px 0;">Motivo del retraso</p>
        <p style="color: #2e2827; font-size: 14px; margin: 0;">${reason.trim()}</p>
      </div>
      <p style="color: #475569; font-size: 13px; margin: 0;">
        Ingresa al sistema para aprobar o rechazar esta solicitud.
      </p>
    `
    const html = emailService.buildEmailLayout('Nueva solicitud de plazo', body, '#870002')
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
  if (trip.id_usuario !== employeeId) {
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

// Lista las solicitudes pendientes de revision
const getPendingRequests = async () => {
  const {data, error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*, Viaje(id_viaje, motivo, origen, destino, fecha_inicio, fecha_fin, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, Cargo(nombre)))')
    .eq('estado', 'PENDIENTE')
    .order('fecha_solicitud', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  else {
    return {requests: data || []}
  }
};

// Lista el historial de solicitudes ya procesadas
const getRequestHistory = async () => {
  const {data, error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*, Viaje(id_viaje, motivo, origen, destino, fecha_inicio, fecha_fin, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, Cargo(nombre)))')
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
    .select('*, Viaje(motivo, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo))')
    .eq('id_solicitud', requestId)
    .single()
  if (!request) {
    return {error: 'Solicitud no encontrada', status: 404}
  }
  if (request.estado !== 'PENDIENTE') {
    return {error: 'Esta solicitud ya fue procesada', status: 400}
  }
  const responseDate = new Date()
  const {error} = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .update({estado: 'APROBADA', id_revisor: reviewerId, fecha_respuesta: responseDate.toISOString()})
    .eq('id_solicitud', requestId)
  if (error) {
    return {error: error.message, status: 500}
  }
  try {
    const employee = request.Viaje?.Usuario
    if (employee?.email_corporativo) {
      const approvalDate = toBoliviaDate(responseDate.toISOString())
      const startDateStr = formatDate(approvalDate)
      const limitStr = formatDate(addDaysToDate(approvalDate, toleranceDays))
      const body = `
        <p style="color: #2e2827; font-size: 14px; margin: 0 0 16px 0;">
          Tu solicitud para seguir registrando gastos fuera del plazo ha sido <strong style="color: #155724;">aprobada</strong>.
        </p>
        <div style="background-color: #F3F6FF; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <p style="color: #475569; font-size: 11px; text-transform: uppercase; font-weight: bold; margin: 0 0 4px 0;">Viaje</p>
          <p style="color: #2e2827; font-size: 14px; margin: 0;">${request.Viaje?.motivo}</p>
        </div>
        <div style="background-color: #d4edda; border-radius: 12px; padding: 16px; margin-bottom: 16px; text-align: center;">
          <p style="color: #155724; font-size: 11px; text-transform: uppercase; font-weight: bold; margin: 0 0 6px 0;">Nuevo plazo para registrar</p>
          <p style="color: #155724; font-size: 18px; font-weight: bold; margin: 0;">${startDateStr} — ${limitStr}</p>
        </div>
        <p style="color: #475569; font-size: 13px; margin: 0;">
          Ya puedes continuar registrando tus gastos. Si necesitas más tiempo después de esa fecha, deberás solicitar una nueva autorización.
        </p>
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
    .from('Solicitud_Autorizacion_Plazo')
    .update({estado: 'RECHAZADA', id_revisor: reviewerId, observacion_revisor: observation.trim(), fecha_respuesta: new Date().toISOString()})
    .eq('id_solicitud', requestId)
  if (error) {
    return {error: error.message, status: 500}
  }
  try {
    const employee = request.Viaje?.Usuario
    if (employee?.email_corporativo) {
      const body = `
        <p style="color: #2e2827; font-size: 14px; margin: 0 0 16px 0;">
          Tu solicitud de autorización de plazo fue <strong style="color: #500203;">rechazada</strong>.
        </p>
        <div style="background-color: #F3F6FF; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <p style="color: #475569; font-size: 11px; text-transform: uppercase; font-weight: bold; margin: 0 0 4px 0;">Viaje</p>
          <p style="color: #2e2827; font-size: 14px; margin: 0;">${request.Viaje?.motivo}</p>
        </div>
        <div style="background-color: #fde9e9; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <p style="color: #500203; font-size: 11px; text-transform: uppercase; font-weight: bold; margin: 0 0 6px 0;">Motivo del rechazo</p>
          <p style="color: #500203; font-size: 14px; margin: 0;">${observation.trim()}</p>
        </div>
        <p style="color: #475569; font-size: 13px; margin: 0;">
          Si consideras que hubo un error, comunícate con tu revisor asignado.
        </p>
      `
      const html = emailService.buildEmailLayout('Autorización de plazo rechazada', body, '#D20F12')
      await emailService.sendEmail([{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}], `Autorización Rechazada — ${request.Viaje?.motivo}`, html)
    }
  }
  catch (error) {
    console.warn('Error notificando al empleado:', error.message)
  }
  return {message: 'Solicitud rechazada correctamente'}
};

module.exports = {createRequest, getRequestStatus, getPendingRequests, getRequestHistory, approveRequest, rejectRequest};