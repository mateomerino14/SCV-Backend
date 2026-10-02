const supabase = require('../../config/supabase')
const tripService = require('../../services/trip/tripService')
const tripStatementService = require('../../services/trip/tripStatementService')
const tripAccessService = require('../../services/trip/tripAccessService')

// Obtiene los datos del dashboard del usuario autenticado
const getDashboard = async (req, res) => {
  const userId = req.user.id_usuario
  const result = await tripService.getDashboardData(userId)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result)
  }
};

// Obtiene el historial de viajes del usuario autenticado
const getHistory = async (req, res) => {
  const userId = req.user.id_usuario
  const {pagina = 1, limite = 20, filtro = 'TODOS'} = req.query
  const result = await tripService.getHistory(userId, pagina, limite, filtro)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result)
  }
};

// Responde 404 si el viaje no existe y 403 si existe pero no le corresponde al usuario
const denyTripAccess = async (tripId, res) => {
  const {data: trip} = await supabase.from('Viaje').select('id_viaje').eq('id_viaje', tripId).maybeSingle()
  if (!trip) {
    return res.status(404).json({error: 'El viaje no existe'})
  }
  return res.status(403).json({error: 'No tienes permiso para ver este viaje'})
}

// Obtiene el detalle de un viaje
const getTripDetail = async (req, res) => {
  if (!(await tripAccessService.canViewTrip(req.params.id, req.user.id_usuario))) {
    return denyTripAccess(req.params.id, res)
  }
  const result = await tripService.getTripDetail(req.params.id, req.user.id_usuario)
  if (result.error) {
    return res.status(500).json({error: result.error})
  }
  else {
    return res.json(result)
  }
};

// Crea un nuevo viaje en estado borrador
const createTrip = async (req, res) => {
  const {motivo, origen, destino, fecha_inicio, fecha_fin, tipo, transporte, placa_vehiculo, monto_asignado, monto_asignado_usd} = req.body
  const userId = req.user.id_usuario
  const tripDataError = tripService.validateTripData(req.body)
  if (tripDataError) {
    return res.status(400).json({error: tripDataError})
  }
  if (transporte === 'Vehículo de Empresa' && !placa_vehiculo?.trim()) {
    return res.status(400).json({error: 'La placa del vehículo es requerida'})
  }
  if (transporte === 'Vehículo de Empresa' && tipo === 'Internacional') {
    return res.status(400).json({error: 'El vehículo de empresa solo está disponible para viajes nacionales'})
  }
  const {data, error} = await supabase
    .from('Viaje')
    .insert({
      motivo: motivo.trim(),
      origen: origen?.trim() || null,
      destino: destino.trim(),
      fecha_inicio,
      fecha_fin,
      tipo,
      transporte: transporte || 'Terrestre',
      placa_vehiculo: transporte === 'Vehículo de Empresa' ? placa_vehiculo.trim() : null,
      monto_asignado,
      monto_asignado_usd: monto_asignado_usd || 0,
      estado: 'BORRADOR',
      id_usuario: userId,
    })
    .select()
    .single()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Edita un viaje en borrador o rechazado
const editTrip = async (req, res) => {
  const userId = req.user.id_usuario
  const result = await tripService.editTrip(req.params.id, userId, req.body)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Envia un viaje en borrador a revision
const submitToReview = async (req, res) => {
  const userId = req.user.id_usuario
  const result = await tripService.submitToReview(req.params.id, userId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Confirma la finalizacion de un viaje
const confirmCompletion = async (req, res) => {
  const {justificaciones} = req.body
  const userId = req.user.id_usuario
  const result = await tripService.confirmCompletion(req.params.id, userId, justificaciones)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};

// Genera y descarga la planilla de rendicion de cuentas en PDF
const downloadStatementPdf = async (req, res) => {
  if (!(await tripAccessService.canViewTrip(req.params.id, req.user.id_usuario))) {
    return denyTripAccess(req.params.id, res)
  }
  const result = await tripStatementService.generateStatementPdf(req.params.id)
  if (result.error) {
    return res.status(result.status || 500).json({error: result.error})
  }
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
  return res.send(result.buffer)
};

module.exports = {getDashboard, getHistory, getTripDetail, createTrip, editTrip, submitToReview, confirmCompletion, downloadStatementPdf};