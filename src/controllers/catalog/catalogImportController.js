const catalogImportService = require('../../services/catalog/catalogImportService');

// Responde con el resultado de la importacion o con su error
const sendResult = (res, result) => {
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  return res.json(result);
};

// Revisa el Excel de secciones y dice fila por fila que se crearia o actualizaria
const previewSectionImport = async (req, res) => sendResult(res, await catalogImportService.previewImport('section', req.body?.filas));

// Guarda las secciones correctas del Excel
const importSections = async (req, res) => sendResult(res, await catalogImportService.importRows('section', req.body?.filas));

// Revisa el Excel de cargos y dice fila por fila que se crearia o actualizaria
const previewPositionImport = async (req, res) => sendResult(res, await catalogImportService.previewImport('position', req.body?.filas));

// Guarda los cargos correctos del Excel
const importPositions = async (req, res) => sendResult(res, await catalogImportService.importRows('position', req.body?.filas));

module.exports = {previewSectionImport, importSections, previewPositionImport, importPositions};
