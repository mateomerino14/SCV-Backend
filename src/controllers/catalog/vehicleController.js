const vehicleService = require('../../services/catalog/vehicleService');

// Responde con el resultado del servicio o con su error
const respond = (res, result, field) => {
  if (result.error) {
    return res.status(result.status || 500).json({error: result.error});
  }
  else {
    return res.json(result[field]);
  }
};

// Lista todos los vehiculos con el viaje que los ocupa
const getAllVehicles = async (req, res) => respond(res, await vehicleService.listVehicles(), 'vehicles');

// Lista los vehiculos libres para elegir al crear o editar un viaje
const getAvailableVehicles = async (req, res) => respond(res, await vehicleService.listAvailableVehicles(req.query.viaje), 'vehicles');

// Registra un vehiculo nuevo
const createVehicle = async (req, res) => respond(res, await vehicleService.saveVehicle(req.body), 'vehicle');

// Actualiza la placa o la descripcion de un vehiculo
const updateVehicle = async (req, res) => respond(res, await vehicleService.saveVehicle(req.body, req.params.id), 'vehicle');

// Suspende un vehiculo para que no se ofrezca en los viajes
const suspendVehicle = async (req, res) => respond(res, await vehicleService.setVehicleActive(req.params.id, false), 'vehicle');

// Vuelve a activar un vehiculo suspendido
const activateVehicle = async (req, res) => respond(res, await vehicleService.setVehicleActive(req.params.id, true), 'vehicle');

// Elimina un vehiculo que nunca se uso
const deleteVehicle = async (req, res) => respond(res, await vehicleService.deleteVehicle(req.params.id), 'message');

module.exports = {getAllVehicles, getAvailableVehicles, createVehicle, updateVehicle, suspendVehicle, activateVehicle, deleteVehicle};
