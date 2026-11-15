const substitutionService = require('../../services/approval/substitutionService');

// Lista las personas de la misma seccion que pueden rendir por el usuario
const getCandidates = async (req, res) => {
  const result = await substitutionService.getCandidates(req.user.id_usuario);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  return res.json({candidatos: result.candidates, sinSeccion: result.sinSeccion});
};

// Crea una solicitud de reemplazo
const createRequest = async (req, res) => {
  const {tripId} = req.params;
  const {id_sustituto} = req.body;
  const requesterId = req.user.id_usuario;
  const result = await substitutionService.createRequest(tripId, requesterId, id_sustituto);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: 'Solicitud enviada correctamente', solicitud: result.request});
  }
};

// Obtiene el estado de la ultima solicitud de reemplazo de un viaje
const getRequestStatus = async (req, res) => {
  const {tripId} = req.params;
  const requesterId = req.user.id_usuario;
  const result = await substitutionService.getRequestStatus(tripId, requesterId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json(result.request);
  }
};

// Aprueba una solicitud de reemplazo
const approveRequest = async (req, res) => {
  const {requestId} = req.params;
  const reviewerId = req.user.id_usuario;
  const result = await substitutionService.approveRequest(requestId, reviewerId);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Rechaza una solicitud de reemplazo
const rejectRequest = async (req, res) => {
  const {requestId} = req.params;
  const {observacion} = req.body;
  const reviewerId = req.user.id_usuario;
  const result = await substitutionService.rejectRequest(requestId, reviewerId, observacion);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json({message: result.message});
  }
};

// Lista los viajes en los que el usuario actua como sustituto aprobado
const getActiveSubstitutions = async (req, res) => {
  const substituteId = req.user.id_usuario;
  const trips = await substitutionService.getActiveSubstitutions(substituteId);
  return res.json(trips);
};

module.exports = {createRequest, getRequestStatus, approveRequest, rejectRequest, getActiveSubstitutions, getCandidates};
