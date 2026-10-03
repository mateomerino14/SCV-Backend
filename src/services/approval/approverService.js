const supabase = require('../../config/supabase');
const emailService = require('../shared/emailService');
const approvalMemoService = require('./approvalMemoService');
const textNormalizer = require('../../utils/textNormalizer');
const hierarchyAssignmentService = require('../shared/hierarchyAssignmentService');
const tripCodeUtil = require('../../utils/tripCode');
const reviewLogService = require('./reviewLogService');
const tripCommentService = require('../trip/tripCommentService');

const memoPositions = [
  'Asistente Administrativo de Seguros y Servicios',
  'Asistente Administrativo - Cargo y Descargo de Cta. Documentada',
  'Asistente de Caja y Tesorería',
  'Gerente RRHH',
  'Jefe de Recursos Humanos',
];

const treasurerPosition = 'asistente de caja y tesorería';

// Obtiene los usuarios activos con correo corporativo y cargo activo
const getActiveUsers = async () => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, email_corporativo, nombre, apellido_paterno, activo, Cargo(nombre, activo)')
    .eq('activo', true);
  if (error) {
    console.error('[getActiveUsers] Error:', error);
    return [];
  }
  else {
    return (data || []).filter((user) => user.email_corporativo && user.email_corporativo.trim() !== '' && user.Cargo?.activo === true);
  }
};

// Envia el memorandum de aprobacion a los destinatarios correspondientes
const sendApprovalMemo = async (trip, approver, tripCode, allUsers) => {
  const normalizedMemoPositions = memoPositions.map((position) => textNormalizer.normalizeText(position));
  const recipients = allUsers.filter((user) => {
    const normalizedPosition = textNormalizer.normalizeText(user.Cargo?.nombre || '');
    return normalizedMemoPositions.includes(normalizedPosition);
  });
  const treasurers = allUsers.filter((user) => textNormalizer.normalizeText(user.Cargo?.nombre || '') === textNormalizer.normalizeText(treasurerPosition));
  treasurers.forEach((treasurer) => {
    const alreadyIncluded = recipients.some((recipient) => recipient.email_corporativo === treasurer.email_corporativo);
    if (!alreadyIncluded) {
      recipients.push(treasurer);
    }
  });
  if (recipients.length === 0) {
    return;
  }
  const to = recipients.map((recipient) => ({email: recipient.email_corporativo, name: `${recipient.nombre} ${recipient.apellido_paterno}`}));
  const memoHtml = approvalMemoService.generateMemoHtml(trip, approver, tripCode);
  const pdfBuffer = await approvalMemoService.generateMemoPdf(memoHtml);
  const pdfBase64 = pdfBuffer.toString('base64');
  const attachments = [{content: pdfBase64, name: `Memorandum_${tripCode.replace('/', '-')}.pdf`}];
  const emailHtml = emailService.buildEmailLayout('Memorándum de aprobación', `
    ${emailService.emailParagraph(`Se adjunta el memorándum del viaje <strong>${tripCode}</strong>.`)}
    ${emailService.emailInfoBox([
      {label: 'Viaje', value: `${tripCode} — ${trip.motivo || ''}`},
      {label: 'Empleado', value: trip.Usuario ? `${trip.Usuario.nombre} ${trip.Usuario.apellido_paterno}` : ''},
    ])}
    ${emailService.emailNote('Se solicita la asignación y aprobación del fondo correspondiente.')}
  `);
  await emailService.sendEmail(to, `Memorandum de Aprobación — ${tripCode}`, emailHtml, attachments);
};

// Lista los viajes pendientes de aprobacion previa, con filtros opcionales
const getPendingTrips = async (approverId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, id_seccion, Seccion(nombre), Cargo(nombre))')
    .eq('estado', 'APROBADO_VIAJE')
    .is('id_aprobador_asignado', null)
    .neq('id_usuario', approverId);
  if (filters.fecha_inicio) {
    query = query.gte('fecha_inicio', filters.fecha_inicio);
  }
  if (filters.fecha_fin) {
    query = query.lte('fecha_fin', filters.fecha_fin);
  }
  if (filters.id_empleado) {
    query = query.eq('id_usuario', filters.id_empleado);
  }
  const {data, error} = await query.order('fecha_inicio', {ascending: false});
  if (error) {
    return {error: error.message};
  }
  else {
    const trips = await hierarchyAssignmentService.filterTripsByHierarchy(
      data || [], approverId, 'APROBADOR', (trip) => trip.id_supervisor_asignado
    );
    return {trips: hierarchyAssignmentService.filterBySection(trips, filters.id_seccion)};
  }
};

// Lista los viajes asignados al aprobador, con filtros opcionales
const getMyTrips = async (approverId, filters) => {
  const selectFields = '*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, id_seccion, Seccion(nombre), Cargo(nombre)), Comentario(*)';
  // El aprobador es unico: todo viaje pendiente de su aprobacion le corresponde
  await hierarchyAssignmentService.claimStageTrips(approverId, 'id_aprobador_asignado', ['APROBADO_VIAJE']);
  let query = supabase
    .from('Viaje')
    .select(selectFields)
    .eq('id_aprobador_asignado', approverId)
    .or('estado.eq.EN_CURSO,and(fue_iniciado.eq.false,estado.in.(APROBADO_VIAJE,EN_REVISION_TESORERO,RECHAZADO))');
  if (filters.fecha_inicio) {
    query = query.gte('fecha_inicio', filters.fecha_inicio);
  }
  if (filters.fecha_fin) {
    query = query.lte('fecha_fin', filters.fecha_fin);
  }
  if (filters.id_empleado) {
    query = query.eq('id_usuario', filters.id_empleado);
  }
  const {data, error} = await query.order('fecha_inicio', {ascending: false});
  if (error) {
    return {error: error.message};
  }
  else {
    // Suma los viajes que el mismo reviso en esta etapa (historial de revision)
    const merged = await reviewLogService.mergeReviewedTrips({
      userId: approverId, stage: reviewLogService.reviewStages.tripApproval, select: selectFields, filters,
      trips: hierarchyAssignmentService.filterBySection(data || [], filters.id_seccion),
    });
    if (merged.error) {
      return {error: merged.error};
    }
    return {trips: merged.trips};
  }
};

// Obtiene el detalle de un viaje junto con los comentarios del aprobador
const getTripDetail = async (tripId, approverId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, id_seccion, Seccion(nombre), Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single();
  if (tripError) {
    return {error: tripError.message, status: 500};
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404};
  }
  const {data: comments} = await supabase
    .from('Comentario').select('*').eq('id_viaje', tripId).order('fecha', {ascending: false});
  return {trip, comments: comments || []};
};

// Aprueba un viaje en fase de aprobacion previa
// Con selfStageSkip se aprueba automaticamente el viaje del propio aprobador (ver selfReviewSkipService)
const approveTrip = async (tripId, approverId, {selfStageSkip = false} = {}) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, id_seccion, Seccion(nombre), Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single();
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404};
  }
  if (trip.id_usuario === approverId && !selfStageSkip) {
    return {error: 'No puedes aprobar tu propio viaje', status: 403};
  }
  if (trip.estado !== 'APROBADO_VIAJE') {
    return {error: 'Este viaje no está en aprobación previa', status: 400};
  }
  if (trip.id_aprobador_asignado && trip.id_aprobador_asignado !== approverId && !selfStageSkip) {
    return {error: 'Este viaje ya está asignado a otro aprobador', status: 403};
  }
  const {data: updatedRows, error} = await supabase
    .from('Viaje')
    .update({estado: 'EN_REVISION_TESORERO', id_aprobador_asignado: approverId})
    .eq('id_viaje', tripId)
    .eq('estado', 'APROBADO_VIAJE')
    .select('id_viaje');
  if (error) {
    return {error: error.message, status: 500};
  }
  // Si no se actualizo ninguna fila, otra persona cambio el viaje entre la lectura y esta accion
  if (!updatedRows?.length) {
    return {error: 'Otra persona ya procesó este viaje. Actualiza la página para ver su estado actual.', status: 409};
  }
  await reviewLogService.recordReview(tripId, approverId, reviewLogService.reviewStages.tripApproval, 'APROBADO', {automatic: selfStageSkip});
  const {data: approverData} = await supabase
    .from('Usuario').select('nombre, apellido_paterno, email_corporativo, Cargo(nombre)').eq('id_usuario', approverId).single();
  // Si es el viaje del propio aprobador, el memorandum indica aprobacion automatica
  const approver = {...approverData, aprobacionAutomatica: selfStageSkip};
  const tripCode = tripCodeUtil.buildTripCode(trip);
  try {
    const allUsers = await getActiveUsers();
    await sendApprovalMemo(trip, approver, tripCode, allUsers);
  }
  catch (emailError) {
    console.error('[approveTrip] Error enviando memo:', emailError);
  }
  // Si el viaje es del propio tesorero, su etapa se aprueba sola
  if (!selfStageSkip) {
    await require('./selfReviewSkipService').advanceSelfReviewStages(tripId);
  }
  return {message: 'Viaje aprobado, memo enviado a tesorería correctamente'};
};

// Rechaza un viaje en fase de aprobacion previa
const rejectTrip = async (tripId, approverId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, estado, ciclo_revision, id_aprobador_asignado, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo)').eq('id_viaje', tripId).single();
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404};
  }
  if (trip.id_usuario === approverId) {
    return {error: 'No puedes rechazar tu propio viaje', status: 403};
  }
  if (trip.estado !== 'APROBADO_VIAJE') {
    return {error: 'Este viaje no está en aprobación previa', status: 400};
  }
  if (trip.id_aprobador_asignado && trip.id_aprobador_asignado !== approverId) {
    return {error: 'Este viaje ya está asignado a otro aprobador', status: 403};
  }
  const {data: existingComments} = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', tripId)
    .eq('id_usuario', approverId)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', trip.ciclo_revision || 1);
  if (!existingComments || existingComments.length === 0) {
    return {error: 'Debes agregar al menos una observación antes de rechazar', status: 400};
  }
  const {data: updatedRows, error} = await supabase
    .from('Viaje')
    .update({estado: 'RECHAZADO', id_aprobador_asignado: approverId})
    .eq('id_viaje', tripId)
    .eq('estado', 'APROBADO_VIAJE')
    .select('id_viaje');
  if (error) {
    return {error: error.message, status: 500};
  }
  else {
    // Si no se actualizo ninguna fila, otra persona cambio el viaje entre la lectura y esta accion
    if (!updatedRows?.length) {
      return {error: 'Otra persona ya procesó este viaje. Actualiza la página para ver su estado actual.', status: 409};
    }
    await reviewLogService.recordReview(tripId, approverId, reviewLogService.reviewStages.tripApproval, 'RECHAZADO');
    await emailService.sendRejectionNotice(trip.Usuario);
    return {message: 'Viaje rechazado correctamente'};
  }
};

module.exports = {
  getPendingTrips, getMyTrips, getTripDetail, approveTrip, rejectTrip,
  addComment: tripCommentService.addTripComment,
  editComment: tripCommentService.editTripComment,
  deleteComment: tripCommentService.deleteTripComment,
};