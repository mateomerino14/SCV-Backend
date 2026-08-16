const supabase = require('../../config/supabase')
const commentModerationService = require('../shared/commentModerationService')

// Agrega un comentario de observacion a un viaje, opcionalmente asociado a un gasto
const addTripComment = async (tripId, userId, description, expenseId) => {
  if (!description || !description.trim()) {
    return {error: 'La descripción es requerida', status: 400}
  }
  if (description.length > 300) {
    return {error: 'El comentario no puede superar los 300 caracteres', status: 400}
  }
  if (commentModerationService.containsForbiddenWords(description)) {
    return {error: 'El comentario contiene palabras inapropiadas', status: 400}
  }
  if (expenseId) {
    const {data: expense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).single()
    if (!expense || expense.id_viaje !== parseInt(tripId)) {
      return {error: 'El gasto no pertenece a este viaje', status: 400}
    }
  }
  const {data: trip} = await supabase.from('Viaje').select('ciclo_revision').eq('id_viaje', tripId).single()
  const {error} = await supabase.from('Comentario').insert({
    descripcion: description.trim(),
    fecha: new Date().toISOString(),
    id_usuario: userId,
    id_viaje: parseInt(tripId),
    tipo: 'OBSERVACION',
    id_gasto: expenseId || null,
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
const editTripComment = async (tripId, commentId, userId, description) => {
  if (!description || !description.trim()) {
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
const deleteTripComment = async (tripId, commentId, userId) => {
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

module.exports = {addTripComment, editTripComment, deleteTripComment};