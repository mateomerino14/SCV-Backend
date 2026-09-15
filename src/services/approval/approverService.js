const supabase = require('../../config/supabase')
const commentModerationService = require('../shared/commentModerationService')
const emailService = require('../shared/emailService')
const approvalMemoService = require('./approvalMemoService')
const textNormalizer = require('../../utils/textNormalizer')
const hierarchyAssignmentService = require('../shared/hierarchyAssignmentService')

const memoPositions = [
  'Asistente Administrativo de Seguros y Servicios',
  'Asistente Administrativo - Cargo y Descargo de Cta. Documentada',
  'Asistente de Caja y Tesorería',
  'Gerente RRHH',
  'Jefe de Recursos Humanos',
]

const treasurerPosition = 'asistente de caja y tesorería'

// Obtiene los usuarios activos con correo corporativo y cargo activo
const getActiveUsers = async () => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, email_corporativo, nombre, apellido_paterno, activo, Cargo(nombre, activo)')
    .eq('activo', true)
  if (error) {
    console.error('[getActiveUsers] Error:', error)
    return []
  }
  else {
    return (data || []).filter((user) => user.email_corporativo && user.email_corporativo.trim() !== '' && user.Cargo?.activo === true)
  }
};

// Envia el memorandum de aprobacion a los destinatarios correspondientes
const sendApprovalMemo = async (trip, approver, tripCode, allUsers) => {
  const normalizedMemoPositions = memoPositions.map((position) => textNormalizer.normalizeText(position))
  const recipients = allUsers.filter((user) => {
    const normalizedPosition = textNormalizer.normalizeText(user.Cargo?.nombre || '')
    return normalizedMemoPositions.includes(normalizedPosition)
  })
  const treasurers = allUsers.filter((user) => textNormalizer.normalizeText(user.Cargo?.nombre || '') === textNormalizer.normalizeText(treasurerPosition))
  treasurers.forEach((treasurer) => {
    const alreadyIncluded = recipients.some((recipient) => recipient.email_corporativo === treasurer.email_corporativo)
    if (!alreadyIncluded) {
      recipients.push(treasurer)
    }
  })
  if (recipients.length === 0) {
    return
  }
  const to = recipients.map((recipient) => ({email: recipient.email_corporativo, name: `${recipient.nombre} ${recipient.apellido_paterno}`}))
  const memoHtml = approvalMemoService.generateMemoHtml(trip, approver, tripCode)
  const pdfBuffer = await approvalMemoService.generateMemoPdf(memoHtml)
  const pdfBase64 = pdfBuffer.toString('base64')
  const attachments = [{content: pdfBase64, name: `Memorandum_${tripCode.replace('/', '-')}.pdf`}]
  const emailHtml = emailService.buildEmailLayout('Memorandum de Aprobación', `
    <p>Se adjunta el memorandum correspondiente al viaje <strong>${tripCode}</strong>. Se solicita la asignación y aprobación del fondo correspondiente.</p>
  `)
  await emailService.sendEmail(to, `Memorandum de Aprobación — ${tripCode}`, emailHtml, attachments)
};

// Lista los viajes pendientes de aprobacion previa, con filtros opcionales
const getPendingTrips = async (approverId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_seccion, Cargo(nombre))')
    .eq('estado', 'APROBADO_VIAJE')
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
  else {
    const trips = await hierarchyAssignmentService.filterTripsByHierarchy(
      data || [], approverId, 'APROBADOR', (trip) => trip.id_supervisor_asignado
    )
    return {trips: hierarchyAssignmentService.filterBySection(trips, filters.numero_seccion)}
  }
};

// Lista los viajes asignados al aprobador, con filtros opcionales
const getMyTrips = async (approverId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_seccion, Cargo(nombre)), Comentario(*)')
    .eq('id_aprobador_asignado', approverId)
    .or('estado.eq.EN_CURSO,and(fue_iniciado.eq.false,estado.in.(APROBADO_VIAJE,EN_REVISION_TESORERO,RECHAZADO))')
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
    return {trips: hierarchyAssignmentService.filterBySection(data || [], filters.numero_seccion)}
  }
};

// Obtiene el detalle de un viaje junto con los comentarios del aprobador
const getTripDetail = async (tripId, approverId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message, status: 500}
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  const {data: comments} = await supabase
    .from('Comentario').select('*').eq('id_viaje', tripId).eq('id_usuario', approverId).order('fecha', {ascending: false})
  return {trip, comments: comments || []}
};

// Aprueba un viaje en fase de aprobacion previa
const approveTrip = async (tripId, approverId) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === approverId) {
    return {error: 'No puedes aprobar tu propio viaje', status: 403}
  }
  if (trip.estado !== 'APROBADO_VIAJE') {
    return {error: 'Este viaje no está en aprobación previa', status: 400}
  }
  if (trip.id_aprobador_asignado && trip.id_aprobador_asignado !== approverId) {
    return {error: 'Este viaje ya está asignado a otro aprobador', status: 403}
  }
  const {error} = await supabase
    .from('Viaje')
    .update({estado: 'EN_REVISION_TESORERO', id_aprobador_asignado: approverId})
    .eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  const {data: approver} = await supabase
    .from('Usuario').select('nombre, apellido_paterno, email_corporativo, Cargo(nombre)').eq('id_usuario', approverId).single()
  const year = new Date().getFullYear()
  const tripCode = `VIA-${tripId}/${year}`
  try {
    const allUsers = await getActiveUsers()
    await sendApprovalMemo(trip, approver, tripCode, allUsers)
  }
  catch (emailError) {
    console.error('[approveTrip] Error enviando memo:', emailError)
  }
  return {message: 'Viaje aprobado, memo enviado a tesorería correctamente'}
};

// Rechaza un viaje en fase de aprobacion previa
const rejectTrip = async (tripId, approverId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, estado, ciclo_revision, id_aprobador_asignado, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo)').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === approverId) {
    return {error: 'No puedes rechazar tu propio viaje', status: 403}
  }
  if (trip.estado !== 'APROBADO_VIAJE') {
    return {error: 'Este viaje no está en aprobación previa', status: 400}
  }
  if (trip.id_aprobador_asignado && trip.id_aprobador_asignado !== approverId) {
    return {error: 'Este viaje ya está asignado a otro aprobador', status: 403}
  }
  const {data: existingComments} = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', tripId)
    .eq('id_usuario', approverId)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', trip.ciclo_revision || 1)
  if (!existingComments || existingComments.length === 0) {
    return {error: 'Debes agregar al menos una observación antes de rechazar', status: 400}
  }
  const {error} = await supabase
    .from('Viaje')
    .update({estado: 'RECHAZADO', id_aprobador_asignado: approverId})
    .eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    await emailService.sendRejectionNotice(trip.Usuario)
    return {message: 'Viaje rechazado correctamente'}
  }
};

// Agrega un comentario de observacion a un viaje
const addComment = async (tripId, userId, description) => {
  if (!description?.trim()) {
    return {error: 'La descripción es requerida', status: 400}
  }
  if (description.length > 300) {
    return {error: 'El comentario no puede superar los 300 caracteres', status: 400}
  }
  if (commentModerationService.containsForbiddenWords(description)) {
    return {error: 'El comentario contiene palabras inapropiadas', status: 400}
  }
  const {data: trip} = await supabase.from('Viaje').select('ciclo_revision').eq('id_viaje', tripId).single()
  const {error} = await supabase.from('Comentario').insert({
    descripcion: description.trim(),
    fecha: new Date().toISOString(),
    id_usuario: userId,
    id_viaje: parseInt(tripId),
    tipo: 'OBSERVACION',
    ciclo_revision: trip?.ciclo_revision || 1,
  })
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Comentario agregado correctamente'}
  }
};

// Edita un comentario existente, verificando que pertenezca al usuario
const editComment = async (tripId, commentId, userId, description) => {
  if (!description?.trim()) {
    return {error: 'La descripción es requerida', status: 400}
  }
  if (description.length > 300) {
    return {error: 'El comentario no puede superar los 300 caracteres', status: 400}
  }
  if (commentModerationService.containsForbiddenWords(description)) {
    return {error: 'El comentario contiene palabras inapropiadas', status: 400}
  }
  const {data: comment} = await supabase.from('Comentario').select('*').eq('id_comentario', commentId).eq('id_viaje', tripId).single()
  if (!comment) {
    return {error: 'Comentario no encontrado', status: 404}
  }
  if (comment.id_usuario !== userId) {
    return {error: 'No tienes permiso para editar este comentario', status: 403}
  }
  const {error} = await supabase.from('Comentario').update({descripcion: description.trim()}).eq('id_comentario', commentId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Comentario editado correctamente'}
  }
};

// Elimina un comentario existente, verificando que pertenezca al usuario
const deleteComment = async (tripId, commentId, userId) => {
  const {data: comment} = await supabase.from('Comentario').select('*').eq('id_comentario', commentId).eq('id_viaje', tripId).single()
  if (!comment) {
    return {error: 'Comentario no encontrado', status: 404}
  }
  if (comment.id_usuario !== userId) {
    return {error: 'No tienes permiso para eliminar este comentario', status: 403}
  }
  const {error} = await supabase.from('Comentario').delete().eq('id_comentario', commentId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Comentario eliminado correctamente'}
  }
};

module.exports = {getPendingTrips, getMyTrips, getTripDetail, approveTrip, rejectTrip, addComment, editComment, deleteComment};