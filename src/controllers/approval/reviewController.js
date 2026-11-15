const reviewService = require('../../services/approval/reviewService');

// Toma un viaje para revision previa
const takeTripReview = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.takeTripReview(tripId, supervisorId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Devuelve un viaje de revision previa
const returnTripReview = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.returnTripReview(tripId, supervisorId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Obtiene el detalle de un viaje en revision previa
const getTripReviewDetail = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.getTripReviewDetail(tripId, supervisorId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({viaje: result.trip, comentarios: result.comments});
  }
};

// Aprueba un viaje en revision previa
const approveTripReview = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.approveTripReview(tripId, supervisorId, {password: req.body?.contrasenia, ip: req.ip});
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Rechaza un viaje en revision previa
const rejectTripReview = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.rejectTripReview(tripId, supervisorId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Toma un viaje para revision de gastos
const takeExpenseReview = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.takeExpenseReview(tripId, supervisorId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Devuelve un viaje de revision de gastos
const returnExpenseReview = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.returnExpenseReview(tripId, supervisorId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Obtiene el detalle de un viaje en revision de gastos
const getExpenseReviewDetail = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.getExpenseReviewDetail(tripId, supervisorId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
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
      enviadoPor: result.submitter,
      excedeTotal: result.totalExceeds,
      excedeTotalUsd: result.totalExceedsUsd,
      alertas: result.alerts,
    });
  }
};

// Aprueba los gastos de un viaje
const approveExpenseReview = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.approveExpenseReview(tripId, supervisorId, {password: req.body?.contrasenia, ip: req.ip});
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Rechaza los gastos de un viaje
const rejectExpenseReview = async (req, res) => {
  const {tripId} = req.params;
  const supervisorId = req.user.id_usuario;
  const result = await reviewService.rejectExpenseReview(tripId, supervisorId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Agrega un comentario a un viaje en revision previa
const addTripReviewComment = async (req, res) => {
  const {tripId} = req.params;
  const {descripcion} = req.body;
  const userId = req.user.id_usuario;
  const result = await reviewService.addComment(tripId, userId, descripcion);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Edita un comentario de un viaje en revision previa
const editTripReviewComment = async (req, res) => {
  const {tripId, commentId} = req.params;
  const {descripcion} = req.body;
  const userId = req.user.id_usuario;
  const result = await reviewService.editComment(tripId, commentId, userId, descripcion);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Elimina un comentario de un viaje en revision previa
const deleteTripReviewComment = async (req, res) => {
  const {tripId, commentId} = req.params;
  const userId = req.user.id_usuario;
  const result = await reviewService.deleteComment(tripId, commentId, userId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Agrega un comentario a un viaje en revision de gastos
const addExpenseReviewComment = async (req, res) => {
  const {tripId} = req.params;
  const {descripcion, id_gasto} = req.body;
  const userId = req.user.id_usuario;
  const result = await reviewService.addComment(tripId, userId, descripcion, id_gasto);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Edita un comentario de un viaje en revision de gastos
const editExpenseReviewComment = async (req, res) => {
  const {tripId, commentId} = req.params;
  const {descripcion} = req.body;
  const userId = req.user.id_usuario;
  const result = await reviewService.editComment(tripId, commentId, userId, descripcion);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Elimina un comentario de un viaje en revision de gastos
const deleteExpenseReviewComment = async (req, res) => {
  const {tripId, commentId} = req.params;
  const userId = req.user.id_usuario;
  const result = await reviewService.deleteComment(tripId, commentId, userId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

module.exports = {takeTripReview, returnTripReview, getTripReviewDetail, approveTripReview, rejectTripReview, addTripReviewComment, editTripReviewComment, deleteTripReviewComment, takeExpenseReview, returnExpenseReview, getExpenseReviewDetail, approveExpenseReview, rejectExpenseReview, addExpenseReviewComment, editExpenseReviewComment, deleteExpenseReviewComment};