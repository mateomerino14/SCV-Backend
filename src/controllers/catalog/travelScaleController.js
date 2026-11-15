const travelScaleService = require('../../services/catalog/travelScaleService');

// Lista la escala de viaticos (cada tipo con sus tarifas)
const getScale = async (req, res) => {
  const result = await travelScaleService.getScale();
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  return res.json(result.scale);
};

// Actualiza las tarifas de un tipo de la escala
const updateScale = async (req, res) => {
  const result = await travelScaleService.updateScale(req.params.tipo, req.body);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  return res.json(result.scale);
};

// Crea un tipo nuevo de la escala
const createScale = async (req, res) => {
  const result = await travelScaleService.createScale(req.body || {});
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  return res.status(201).json(result.scale);
};

// Elimina un tipo de la escala que ningun cargo usa
const deleteScale = async (req, res) => {
  const result = await travelScaleService.deleteScale(req.params.tipo);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  return res.json({message: `Se eliminó el tipo ${result.deleted} de la escala`});
};

module.exports = {getScale, createScale, updateScale, deleteScale};
