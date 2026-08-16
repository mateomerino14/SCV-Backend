const supabase = require('../../config/supabase')
const emailService = require('../shared/emailService')

const toleranceDays = 4

// Formatea una fecha ISO a formato dia/mes/anio
const formatDate = (isoString) => {
  const [year, month, day] = isoString.split('-')
  return `${day}/${month}/${year}`
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
    const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
      <h2 style="font-size:16pt;margin-bottom:12px;">Solicitud de Autorización de Plazo</h2>
      <p style="margin-bottom:8px;">${trip.Usuario?.nombre} ${trip.Usuario?.apellido_paterno} solicita autorización para seguir registrando gastos del viaje "${trip.motivo}" fuera del plazo de tolerancia.</p>
      <p style="margin-bottom:8px;"><strong>Motivo:</strong> ${reason.trim()}</p>
      <p style="font-size:10pt;color:#666;margin-top:16px;">Ingresa al sistema para aprobar o rechazar esta solicitud.</p>
    </div>`
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
    const extendedLimit = new Date(data.fecha_respuesta)
    extendedLimit.setDate(extendedLimit.getDate() + toleranceDays)
    const today = new Date().toISOString().split('T')[0]
    const extendedLimitStr = extendedLimit.toISOString().split('T')[0]
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
      const startDateStr = formatDate(responseDate.toISOString().split('T')[0])
      const extendedLimit = new Date(responseDate)
      extendedLimit.setDate(extendedLimit.getDate() + toleranceDays)
      const limitStr = formatDate(extendedLimit.toISOString().split('T')[0])
      const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
        <h2 style="font-size:16pt;margin-bottom:12px;">Autorización Aprobada</h2>
        <p style="margin-bottom:8px;">Tu solicitud para seguir registrando gastos del viaje "${request.Viaje?.motivo}" fuera del plazo ha sido aprobada.</p>
        <p style="margin-bottom:8px;">Ya puedes continuar registrando tus gastos. Tu nuevo plazo es del <strong>${startDateStr}</strong> al <strong>${limitStr}</strong> para completar tus registros. Si necesitas más tiempo después de esa fecha, deberás solicitar una nueva autorización.</p>
      </div>`
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
      const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
        <h2 style="font-size:16pt;margin-bottom:12px;">Autorización Rechazada</h2>
        <p style="margin-bottom:8px;">Tu solicitud para el viaje "${request.Viaje?.motivo}" fue rechazada.</p>
        <p style="margin-bottom:8px;"><strong>Motivo:</strong> ${observation.trim()}</p>
      </div>`
      await emailService.sendEmail([{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}], `Autorización Rechazada — ${request.Viaje?.motivo}`, html)
    }
  }
  catch (error) {
    console.warn('Error notificando al empleado:', error.message)
  }
  return {message: 'Solicitud rechazada correctamente'}
};

module.exports = {createRequest, getRequestStatus, getPendingRequests, getRequestHistory, approveRequest, rejectRequest};