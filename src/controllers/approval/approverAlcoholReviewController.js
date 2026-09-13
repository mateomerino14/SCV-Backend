const approverAlcoholReviewService = require('../../services/approval/approverAlcoholReviewService')

// Lista los viajes pendientes de revision adicional por alcohol
const getPendingAlcoholReviews = async (req, res) => {
  const approverId = req.user.id_usuario
  const result = await approverAlcoholReviewService.getPendingAlcoholReviews(approverId, req.query)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.trips)
  }
};

// Lista los viajes de revision adicional asignados al aprobador
const getMyAlcoholReviews = async (req, res) => {
  const approverId = req.user.id_usuario
  const result = await approverAlcoholReviewService.getMyAlcoholReviews(approverId, req.query)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.trips)
  }
};

// Toma un viaje para revision adicional por alcohol
const takeAlcoholReview = async (req, res) => {
  const {tripId} = req.params
  const approverId = req.user.id_usuario
  const result = await approverAlcoholReviewService.takeAlcoholReview(tripId, approverId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Devuelve un viaje de revision adicional por alcohol
const returnAlcoholReview = async (req, res) => {
  const {tripId} = req.params
  const approverId = req.user.id_usuario
  const result = await approverAlcoholReviewService.returnAlcoholReview(tripId, approverId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Obtiene el detalle de un viaje en revision adicional por alcohol
const getAlcoholReviewDetail = async (req, res) => {
  const {tripId} = req.params
  const approverId = req.user.id_usuario
  const result = await approverAlcoholReviewService.getAlcoholReviewDetail(tripId, approverId)
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
      alertas: result.alerts,
    })
  }
};

// Aprueba la revision adicional por alcohol
const approveAlcoholReview = async (req, res) => {
  const {tripId} = req.params
  const approverId = req.user.id_usuario
  const result = await approverAlcoholReviewService.approveAlcoholReview(tripId, approverId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Rechaza la revision adicional por alcohol
const rejectAlcoholReview = async (req, res) => {
  const {tripId} = req.params
  const approverId = req.user.id_usuario
  const result = await approverAlcoholReviewService.rejectAlcoholReview(tripId, approverId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Agrega un comentario a un viaje en revision adicional por alcohol
const addAlcoholReviewComment = async (req, res) => {
  const {tripId} = req.params
  const {descripcion, id_gasto} = req.body
  const userId = req.user.id_usuario
  const result = await approverAlcoholReviewService.addComment(tripId, userId, descripcion, id_gasto)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Edita un comentario de un viaje en revision adicional por alcohol
const editAlcoholReviewComment = async (req, res) => {
  const {tripId, commentId} = req.params
  const {descripcion} = req.body
  const userId = req.user.id_usuario
  const result = await approverAlcoholReviewService.editComment(tripId, commentId, userId, descripcion)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Elimina un comentario de un viaje en revision adicional por alcohol
const deleteAlcoholReviewComment = async (req, res) => {
  const {tripId, commentId} = req.params
  const userId = req.user.id_usuario
  const result = await approverAlcoholReviewService.deleteComment(tripId, commentId, userId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

module.exports = {
  getPendingAlcoholReviews, getMyAlcoholReviews, takeAlcoholReview, returnAlcoholReview,
  getAlcoholReviewDetail, approveAlcoholReview, rejectAlcoholReview,
  addAlcoholReviewComment, editAlcoholReviewComment, deleteAlcoholReviewComment,
};
