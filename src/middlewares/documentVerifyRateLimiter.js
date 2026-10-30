const {rateLimit} = require('express-rate-limit');

// La verificacion es publica: se limita por IP para que no se puedan probar codigos al azar
const documentVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: {error: 'Demasiadas consultas. Espera unos minutos antes de volver a verificar.'},
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = documentVerifyRateLimiter;
