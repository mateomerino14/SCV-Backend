const supabase = require('../../config/supabase')
const emailService = require('../shared/emailService')
const treasuryDocumentService = require('./treasuryDocumentService')
const tripCommentService = require('../trip/tripCommentService')
const tripCodeUtil = require('../../utils/tripCode')

// Lista los viajes pendientes de aprobacion de fondos
const getPendingTrips = async (treasurerId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre))')
    .eq('estado', 'EN_REVISION_TESORERO')
    .neq('id_usuario', treasurerId)
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

// Lista los viajes asignados al tesorero
const getMyTrips = async (treasurerId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Comentario(*)')
    .eq('id_tesorero_asignado', treasurerId)
    .or('estado.eq.EN_CURSO,and(fue_iniciado.eq.false,estado.in.(EN_REVISION_TESORERO,RECHAZADO))')
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

// Obtiene el detalle de un viaje para tesoreria
const getTripDetail = async (tripId, treasurerId) => {
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
    .from('Comentario').select('*').eq('id_viaje', tripId).order('fecha', {ascending: false})
  return {trip, comments: comments || []}
};

// Actualiza los montos asignados de un viaje
const updateAmounts = async (tripId, amounts) => {
  if (amounts.monto_asignado === undefined || isNaN(parseFloat(amounts.monto_asignado)) || parseFloat(amounts.monto_asignado) < 0) {
    return {error: 'El monto asignado en Bs debe ser un número válido', status: 400}
  }
  const {data: trip} = await supabase.from('Viaje').select('estado').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.estado !== 'EN_REVISION_TESORERO') {
    return {error: 'Este viaje no está en revisión de tesorería', status: 400}
  }
  let assignedAmountUsd = 0
  if (amounts.monto_asignado_usd !== undefined) {
    assignedAmountUsd = parseFloat(amounts.monto_asignado_usd) || 0
  }
  const {error} = await supabase
    .from('Viaje')
    .update({monto_asignado: parseFloat(amounts.monto_asignado), monto_asignado_usd: assignedAmountUsd})
    .eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Montos actualizados correctamente'}
  }
};

// Aprueba el fondo de un viaje y notifica al empleado
const approveTrip = async (tripId, treasurerId) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === treasurerId) {
    return {error: 'No puedes aprobar tu propio viaje', status: 403}
  }
  if (trip.estado !== 'EN_REVISION_TESORERO') {
    return {error: 'Este viaje no está en revisión de tesorería', status: 400}
  }
  const {error} = await supabase
    .from('Viaje')
    .update({estado: 'EN_CURSO', fue_iniciado: true, id_tesorero_asignado: treasurerId})
    .eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  const {data: treasurer} = await supabase.from('Usuario').select('nombre, apellido_paterno, Cargo(nombre)').eq('id_usuario', treasurerId).single()
  const tripCode = tripCodeUtil.buildTripCode(trip)
  try {
    const employee = trip.Usuario
    if (employee?.email_corporativo) {
      const confirmationHtml = treasuryDocumentService.generateFundConfirmationHtml(trip, treasurer, tripCode)
      const pdfBuffer = await treasuryDocumentService.generatePdf(confirmationHtml)
      const pdfBase64 = pdfBuffer.toString('base64')
      const attachments = [{content: pdfBase64, name: `Confirmacion_Fondo_${tripCode.replace('/', '-')}.pdf`}]
      const emailHtml = emailService.buildEmailLayout('Fondo Aprobado', `
        <p>Tu fondo para el viaje <strong>${tripCode}</strong> ha sido aprobado. Ya puedes registrar tus gastos.</p>
      `, '#155724')
      await emailService.sendEmail(
        [{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}],
        `Fondo Aprobado — ${tripCode}`,
        emailHtml,
        attachments
      )
    }
  }
  catch (emailError) {
    console.warn('Error enviando confirmación:', emailError.message)
  }
  return {message: 'Fondo aprobado y confirmación enviada al empleado correctamente'}
};

// Rechaza el fondo de un viaje
const rejectTrip = async (tripId, treasurerId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, estado, ciclo_revision').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === treasurerId) {
    return {error: 'No puedes rechazar tu propio viaje', status: 403}
  }
  if (trip.estado !== 'EN_REVISION_TESORERO') {
    return {error: 'Este viaje no está en revisión de tesorería', status: 400}
  }
  const {data: existingComments} = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', tripId)
    .eq('id_usuario', treasurerId)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', trip.ciclo_revision || 1)
  if (!existingComments || existingComments.length === 0) {
    return {error: 'Debes agregar al menos una observación antes de rechazar', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({estado: 'RECHAZADO', id_tesorero_asignado: treasurerId}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Viaje rechazado correctamente'}
  }
};

module.exports = {
  getPendingTrips, getMyTrips, getTripDetail, updateAmounts, approveTrip, rejectTrip,
  addComment: tripCommentService.addTripComment,
  editComment: tripCommentService.editTripComment,
  deleteComment: tripCommentService.deleteTripComment,
};