const rateLimit = require('express-rate-limit')

// Limita el envio y verificacion de codigos de recuperacion de contrasenia
const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.'},
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = passwordResetRateLimiter;
