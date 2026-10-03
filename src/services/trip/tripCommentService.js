const supabase = require('../../config/supabase');
const commentModerationService = require('../shared/commentModerationService');
const textNormalizer = require('../../utils/textNormalizer');
const userDirectoryService = require('../user/userDirectoryService');

// Etapas de revision y el campo que indica quien la tiene asignada. En las etapas de roles
// unicos (aprobador, revisor) y de tesoreria la ruta ya exige el rol o cargo.
const reviewStageFields = {
  EN_REVISION_VIAJE: {field: 'id_supervisor_asignado', mustBeAssigned: true, role: 'SUPERVISOR'},
  EN_REVISION: {field: 'id_supervisor_asignado', mustBeAssigned: true, role: 'SUPERVISOR'},
  APROBADO_VIAJE: {field: 'id_aprobador_asignado', mustBeAssigned: false, role: 'APROBADOR'},
  EN_REVISION_APROBADOR: {field: 'id_aprobador_asignado', mustBeAssigned: false, role: 'APROBADOR'},
  EN_REVISION_TESORERO: {field: null, mustBeAssigned: false, treasurer: true},
  APROBADO_SUPERVISOR: {field: 'id_revisor_asignado', mustBeAssigned: false, role: 'REVISOR'},
};

// Datos del usuario para saber si le corresponde la etapa (rol o cargo de tesorero)
const getCommenter = async (userId) => {
  const {data} = await supabase.from('Usuario').select('Rol(nombre), Cargo(nombre)').eq('id_usuario', userId).single();
  return data;
};

// Solo quien revisa la etapa actual puede observar el viaje: nadie comenta un viaje ya
// decidido ni uno propio, ni uno de una etapa que no le corresponde o asignado a otra persona
const checkCanComment = async (trip, userId) => {
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404};
  }
  if (trip.id_usuario === userId) {
    return {error: 'No puedes observar tu propio viaje', status: 403};
  }
  const stage = reviewStageFields[trip.estado];
  if (!stage) {
    return {error: 'El viaje no está en una etapa de revisión', status: 400};
  }
  const commenter = await getCommenter(userId);
  const isTreasurer = textNormalizer.normalizeText(commenter?.Cargo?.nombre || '') === textNormalizer.normalizeText(userDirectoryService.treasurerPositionName);
  const matchesStage = stage.treasurer ? isTreasurer : commenter?.Rol?.nombre === stage.role;
  if (!matchesStage) {
    return {error: 'Este viaje no está en tu etapa de revisión', status: 403};
  }
  const assignedId = stage.field ? trip[stage.field] : null;
  if (stage.mustBeAssigned && assignedId !== userId) {
    return {error: 'Debes tomar el viaje para poder observarlo', status: 403};
  }
  if (assignedId && assignedId !== userId) {
    return {error: 'Este viaje está asignado a otra persona', status: 403};
  }
  return null;
};

const tripColumns = 'id_usuario, estado, ciclo_revision, id_supervisor_asignado, id_aprobador_asignado, id_revisor_asignado';

// Agrega un comentario de observacion a un viaje, opcionalmente asociado a un gasto
const addTripComment = async (tripId, userId, description, expenseId) => {
  if (!description || !description.trim()) {
    return {error: 'La descripción es requerida', status: 400};
  }
  if (description.length > 300) {
    return {error: 'El comentario no puede superar los 300 caracteres', status: 400};
  }
  if (commentModerationService.containsForbiddenWords(description)) {
    return {error: 'El comentario contiene palabras inapropiadas', status: 400};
  }
  const {data: trip} = await supabase.from('Viaje').select(tripColumns).eq('id_viaje', tripId).single();
  const denied = await checkCanComment(trip, userId);
  if (denied) {
    return denied;
  }
  if (expenseId) {
    const {data: expense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).single();
    if (!expense || expense.id_viaje !== parseInt(tripId)) {
      return {error: 'El gasto no pertenece a este viaje', status: 400};
    }
  }
  const {error} = await supabase.from('Comentario').insert({
    descripcion: description.trim(),
    fecha: new Date().toISOString(),
    id_usuario: userId,
    id_viaje: parseInt(tripId),
    tipo: 'OBSERVACION',
    id_gasto: expenseId || null,
    ciclo_revision: trip?.ciclo_revision || 1,
  });
  if (error) {
    return {error: error.message, status: 500};
  }
  else {
    return {message: 'Comentario agregado correctamente'};
  }
};

// Edita un comentario existente, verificando que pertenezca al usuario
const editTripComment = async (tripId, commentId, userId, description) => {
  if (!description || !description.trim()) {
    return {error: 'La descripción es requerida', status: 400};
  }
  if (description.length > 300) {
    return {error: 'El comentario no puede superar los 300 caracteres', status: 400};
  }
  if (commentModerationService.containsForbiddenWords(description)) {
    return {error: 'El comentario contiene palabras inapropiadas', status: 400};
  }
  const {data: comment} = await supabase.from('Comentario').select('*').eq('id_comentario', commentId).eq('id_viaje', tripId).single();
  if (!comment) {
    return {error: 'Comentario no encontrado', status: 404};
  }
  if (comment.id_usuario !== userId) {
    return {error: 'No tienes permiso para editar este comentario', status: 403};
  }
  if (comment.tipo !== 'OBSERVACION') {
    return {error: 'Solo se pueden modificar observaciones', status: 403};
  }
  // Una observacion ya no se cambia cuando la etapa se decidio o paso a otro ciclo: es el
  // respaldo de la aprobacion o del rechazo
  const {data: trip} = await supabase.from('Viaje').select(tripColumns).eq('id_viaje', tripId).single();
  const denied = await checkCanComment(trip, userId);
  if (denied) {
    return denied;
  }
  if ((comment.ciclo_revision || 1) !== (trip.ciclo_revision || 1)) {
    return {error: 'Esta observación pertenece a una revisión anterior', status: 403};
  }
  const {error} = await supabase.from('Comentario').update({descripcion: description.trim()}).eq('id_comentario', commentId);
  if (error) {
    return {error: error.message, status: 500};
  }
  else {
    return {message: 'Comentario editado correctamente'};
  }
};

// Elimina un comentario existente, verificando que pertenezca al usuario
const deleteTripComment = async (tripId, commentId, userId) => {
  const {data: comment} = await supabase.from('Comentario').select('*').eq('id_comentario', commentId).eq('id_viaje', tripId).single();
  if (!comment) {
    return {error: 'Comentario no encontrado', status: 404};
  }
  if (comment.id_usuario !== userId) {
    return {error: 'No tienes permiso para eliminar este comentario', status: 403};
  }
  if (comment.tipo !== 'OBSERVACION') {
    return {error: 'Solo se pueden modificar observaciones', status: 403};
  }
  // Una observacion ya no se cambia cuando la etapa se decidio o paso a otro ciclo: es el
  // respaldo de la aprobacion o del rechazo
  const {data: trip} = await supabase.from('Viaje').select(tripColumns).eq('id_viaje', tripId).single();
  const denied = await checkCanComment(trip, userId);
  if (denied) {
    return denied;
  }
  if ((comment.ciclo_revision || 1) !== (trip.ciclo_revision || 1)) {
    return {error: 'Esta observación pertenece a una revisión anterior', status: 403};
  }
  const {error} = await supabase.from('Comentario').delete().eq('id_comentario', commentId);
  if (error) {
    return {error: error.message, status: 500};
  }
  else {
    return {message: 'Comentario eliminado correctamente'};
  }
};

module.exports = {addTripComment, editTripComment, deleteTripComment};