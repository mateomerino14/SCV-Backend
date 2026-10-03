const rateLimit = require('express-rate-limit');

// Limita los intentos de login fallidos por IP. Los ingresos correctos no cuentan, para
// que una oficina que sale a internet con una sola IP no se bloquee con el uso normal.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: {error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos antes de volver a intentar.'},
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = loginRateLimiter;
