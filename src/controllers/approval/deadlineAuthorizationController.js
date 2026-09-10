const deadlineAuthorizationService = require('../../services/approval/deadlineAuthorizationService')

// Crea una solicitud de autorizacion de plazo
const createRequest = async (req, res) => {
  const {tripId} = req.params
  const {motivo} = req.body
  const employeeId = req.user.id_usuario
  const result = await deadlineAuthorizationService.createRequest(tripId, employeeId, motivo)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: 'Solicitud enviada correctamente', solicitud: result.request})
  }
};

// Obtiene el estado de la ultima solicitud de un viaje
const getRequestStatus = async (req, res) => {
  const {tripId} = req.params
  const employeeId = req.user.id_usuario
  const result = await deadlineAuthorizationService.getRequestStatus(tripId, employeeId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json(result.request)
  }
};

// Lista las solicitudes pendientes de revision
const getPendingRequests = async (req, res) => {
  const result = await deadlineAuthorizationService.getPendingRequests()
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.requests)
  }
};

// Lista el historial de solicitudes ya procesadas
const getRequestHistory = async (req, res) => {
  const result = await deadlineAuthorizationService.getRequestHistory()
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result.requests)
  }
};

// Aprueba una solicitud de autorizacion de plazo
const approveRequest = async (req, res) => {
  const {requestId} = req.params
  const reviewerId = req.user.id_usuario
  const result = await deadlineAuthorizationService.approveRequest(requestId, reviewerId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Rechaza una solicitud de autorizacion de plazo
const rejectRequest = async (req, res) => {
  const {requestId} = req.params
  const {observacion} = req.body
  const reviewerId = req.user.id_usuario
  const result = await deadlineAuthorizationService.rejectRequest(requestId, reviewerId, observacion)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

module.exports = {createRequest, getRequestStatus, getPendingRequests, getRequestHistory, approveRequest, rejectRequest};