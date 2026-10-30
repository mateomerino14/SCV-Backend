const documentSealService = require('../../services/shared/documentSealService');

// Devuelve los datos publicos de un documento emitido a partir de su codigo, para comprobar que es autentico
const verifyDocument = async (req, res) => {
  const result = await documentSealService.verifyDocument(req.params.code);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json(result.document);
  }
};

module.exports = {verifyDocument};
