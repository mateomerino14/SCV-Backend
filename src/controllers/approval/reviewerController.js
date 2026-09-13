const reviewerService = require('../../services/approval/reviewerService')

// Lista los viajes pendientes de revision final
const getPendingReviews = async (req, res) => {
  const reviewerId = req.user.id_usuario
  const result = await reviewerService.getPendingReviews(reviewerId, req.query)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.trips)
  }
};

// Lista las revisiones finales asignadas al revisor
const getMyReviews = async (req, res) => {
  const reviewerId = req.user.id_usuario
  const result = await reviewerService.getMyReviews(reviewerId, req.query)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.trips)
  }
};

// Obtiene el detalle de un viaje en revision final
const getReviewDetail = async (req, res) => {
  const {tripId} = req.params
  const reviewerId = req.user.id_usuario
  const result = await reviewerService.getReviewDetail(tripId, reviewerId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({
      viaje: result.trip,
      gastos: result.expenses,
      comentarios: result.comments,
      gastoAcumulado: result.accumulatedExpense,
      gastoAcumuladoUsd: result.accumulatedExpenseUsd,
      excedePresupuesto: result.exceedsBudget,
      excedePresupuestoUsd: result.exceedsBudgetUsd,
      diasExcedidos: result.exceededDays,
      desgloseDiario: result.dailyBreakdown,
      excedeHoteles: result.hotelExceeds,
      excedeTotal: result.totalExceeds,
      excedeTotalUsd: result.totalExceedsUsd,
      alertas: result.alerts,
    })
  }
};

// Aprueba definitivamente un viaje
const approveReview = async (req, res) => {
  const {tripId} = req.params
  const reviewerId = req.user.id_usuario
  const result = await reviewerService.approveReview(tripId, reviewerId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message, advertencia: result.warning})
  }
};

// Rechaza definitivamente un viaje
const rejectReview = async (req, res) => {
  const {tripId} = req.params
  const reviewerId = req.user.id_usuario
  const result = await reviewerService.rejectReview(tripId, reviewerId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Agrega un comentario a un viaje en revision final
const addComment = async (req, res) => {
  const {tripId} = req.params
  const {descripcion, id_gasto} = req.body
  const userId = req.user.id_usuario
  const result = await reviewerService.addComment(tripId, userId, descripcion, id_gasto)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Edita un comentario de un viaje en revision final
const editComment = async (req, res) => {
  const {tripId, commentId} = req.params
  const {descripcion} = req.body
  const userId = req.user.id_usuario
  const result = await reviewerService.editComment(tripId, commentId, userId, descripcion)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Elimina un comentario de un viaje en revision final
const deleteComment = async (req, res) => {
  const {tripId, commentId} = req.params
  const userId = req.user.id_usuario
  const result = await reviewerService.deleteComment(tripId, commentId, userId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

module.exports = {getPendingReviews, getMyReviews, getReviewDetail, approveReview, rejectReview, addComment, editComment, deleteComment};