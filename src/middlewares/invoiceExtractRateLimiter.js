const {rateLimit, ipKeyGenerator} = require('express-rate-limit');

// Cuenta por usuario con sesion; sin sesion, por IP
const extractKey = (req) => {
  if (req.user?.id_usuario) {
    return String(req.user.id_usuario);
  }
  return ipKeyGenerator(req.ip);
};

// Limita las extracciones de facturas con IA por usuario, ya que cada llamada tiene costo
const invoiceExtractRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {error: 'Alcanzaste el límite de extracciones de facturas por hora. Intenta nuevamente más tarde.'},
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: extractKey,
});

module.exports = invoiceExtractRateLimiter;
