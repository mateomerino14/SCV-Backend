const {rateLimit, ipKeyGenerator} = require('express-rate-limit')

// Limita las extracciones de facturas con IA por usuario, ya que cada llamada tiene costo
const invoiceExtractRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {error: 'Alcanzaste el límite de extracciones de facturas por hora. Intenta nuevamente más tarde.'},
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id_usuario ? String(req.user.id_usuario) : ipKeyGenerator(req.ip)),
})

module.exports = invoiceExtractRateLimiter;
