const travelScaleService = require('../../services/catalog/travelScaleService');

// Lista la escala de viaticos (tipos A, B y C con sus tarifas)
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

module.exports = {getScale, updateScale};
