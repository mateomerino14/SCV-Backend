const approverService = require('../../services/approval/approverService')

// Lista los viajes pendientes de aprobacion previa
const getPendingTrips = async (req, res) => {
  const approverId = req.user.id_usuario
  const result = await approverService.getPendingTrips(approverId, req.query)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.trips)
  }
};

// Lista los viajes asignados al aprobador autenticado
const getMyTrips = async (req, res) => {
  const approverId = req.user.id_usuario
  const result = await approverService.getMyTrips(approverId, req.query)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.trips)
  }
};

// Obtiene el detalle de un viaje junto con los comentarios del aprobador
const getTripDetail = async (req, res) => {
  const {tripId} = req.params
  const approverId = req.user.id_usuario
  const result = await approverService.getTripDetail(tripId, approverId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({viaje: result.trip, comentarios: result.comments})
  }
};

// Aprueba un viaje en fase de aprobacion previa
const approveTrip = async (req, res) => {
  const {tripId} = req.params
  const approverId = req.user.id_usuario
  const result = await approverService.approveTrip(tripId, approverId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Rechaza un viaje en fase de aprobacion previa
const rejectTrip = async (req, res) => {
  const {tripId} = req.params
  const approverId = req.user.id_usuario
  const result = await approverService.rejectTrip(tripId, approverId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Agrega un comentario de observacion a un viaje
const addComment = async (req, res) => {
  const {tripId} = req.params
  const {descripcion} = req.body
  const userId = req.user.id_usuario
  const result = await approverService.addComment(tripId, userId, descripcion)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Edita un comentario existente
const editComment = async (req, res) => {
  const {tripId, commentId} = req.params
  const {descripcion} = req.body
  const userId = req.user.id_usuario
  const result = await approverService.editComment(tripId, commentId, userId, descripcion)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Elimina un comentario existente
const deleteComment = async (req, res) => {
  const {tripId, commentId} = req.params
  const userId = req.user.id_usuario
  const result = await approverService.deleteComment(tripId, commentId, userId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

module.exports = {getPendingTrips, getMyTrips, getTripDetail, approveTrip, rejectTrip, addComment, editComment, deleteComment};