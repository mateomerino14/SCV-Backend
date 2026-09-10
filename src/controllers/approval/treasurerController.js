const treasurerService = require('../../services/approval/treasurerService')

// Lista los viajes pendientes de aprobacion de fondos
const getPendingTrips = async (req, res) => {
  const treasurerId = req.user.id_usuario
  const result = await treasurerService.getPendingTrips(treasurerId, req.query)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.trips)
  }
};

// Lista los viajes asignados al tesorero
const getMyTrips = async (req, res) => {
  const treasurerId = req.user.id_usuario
  const result = await treasurerService.getMyTrips(treasurerId, req.query)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.trips)
  }
};

// Obtiene el detalle de un viaje para tesoreria
const getTripDetail = async (req, res) => {
  const {tripId} = req.params
  const treasurerId = req.user.id_usuario
  const result = await treasurerService.getTripDetail(tripId, treasurerId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({viaje: result.trip, comentarios: result.comments})
  }
};

// Actualiza los montos asignados de un viaje
const updateAmounts = async (req, res) => {
  const {tripId} = req.params
  const result = await treasurerService.updateAmounts(tripId, req.body)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Aprueba el fondo de un viaje
const approveTrip = async (req, res) => {
  const {tripId} = req.params
  const treasurerId = req.user.id_usuario
  const result = await treasurerService.approveTrip(tripId, treasurerId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Rechaza el fondo de un viaje
const rejectTrip = async (req, res) => {
  const {tripId} = req.params
  const treasurerId = req.user.id_usuario
  const result = await treasurerService.rejectTrip(tripId, treasurerId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Agrega un comentario a un viaje en revision de tesoreria
const addComment = async (req, res) => {
  const {tripId} = req.params
  const {descripcion} = req.body
  const userId = req.user.id_usuario
  const result = await treasurerService.addComment(tripId, userId, descripcion)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Edita un comentario de un viaje en revision de tesoreria
const editComment = async (req, res) => {
  const {tripId, commentId} = req.params
  const {descripcion} = req.body
  const userId = req.user.id_usuario
  const result = await treasurerService.editComment(tripId, commentId, userId, descripcion)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Elimina un comentario de un viaje en revision de tesoreria
const deleteComment = async (req, res) => {
  const {tripId, commentId} = req.params
  const userId = req.user.id_usuario
  const result = await treasurerService.deleteComment(tripId, commentId, userId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

module.exports = {getPendingTrips, getMyTrips, getTripDetail, updateAmounts, approveTrip, rejectTrip, addComment, editComment, deleteComment};