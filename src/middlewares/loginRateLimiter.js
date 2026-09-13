const rateLimit = require('express-rate-limit')

// Limita los intentos de login
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos antes de volver a intentar.'},
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = loginRateLimiter;