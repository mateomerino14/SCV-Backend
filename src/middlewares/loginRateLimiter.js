const rateLimit = require('express-rate-limit')

// Limita los intentos de login
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {error: 'Demasiados intentos de inicio de sesion. Intenta nuevamente en unos minutos.'},
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = loginRateLimiter;