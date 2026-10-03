const rateLimit = require('express-rate-limit');

const limitMessage = {error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.'};

// Envio de codigos de recuperacion: cuenta todos los pedidos, porque cada uno manda un correo
const sendCodeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

// Verificacion de codigos: solo cuentan los intentos fallidos
const verifyCodeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {sendCodeRateLimiter, verifyCodeRateLimiter};
