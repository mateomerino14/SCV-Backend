const exchangeRateService = require('../../services/shared/exchangeRateService');

// Devuelve el tipo de cambio de una moneda en una fecha (unidades por 1 USD)
const getDailyRate = async (req, res) => {
  try {
    const result = await exchangeRateService.getDailyRate(req.query.fecha, req.query.moneda);
    if (result.error) {
      return res.status(result.status).json({error: result.error, permiteManual: !!result.permiteManual});
    }
    return res.json(result.rate);
  }
  catch (error) {
    return res.status(500).json({error: error.message});
  }
};

// Lista las monedas que se pueden registrar en los tramos de cambio
const getSupportedCurrencies = (req, res) => res.json({monedas: exchangeRateService.supportedCurrencies});

module.exports = {getDailyRate, getSupportedCurrencies};
