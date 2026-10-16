const {rateLimit, ipKeyGenerator} = require('express-rate-limit');

const windowMs = 15 * 60 * 1000;
const limitMessage = {error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.'};

// Arma la clave de la cuenta: IP mas correo, para no bloquear a otros usuarios de la misma red
const accountKey = (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email_corporativo || '').trim().toLowerCase()}`;

// Tope alto por IP para frenar a quien recorre muchas cuentas
const ipLimiter = (skipSuccessfulRequests) => rateLimit({windowMs, max: 50, skipSuccessfulRequests, message: limitMessage, standardHeaders: true, legacyHeaders: false});

// Envio de codigos de recuperacion: cuenta todos los pedidos, porque cada uno manda un correo
const sendCodeRateLimiter = [ipLimiter(false), rateLimit({
  windowMs,
  max: 10,
  keyGenerator: accountKey,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
})];

// Verificacion de codigos: solo cuentan los intentos fallidos
const verifyCodeRateLimiter = [ipLimiter(true), rateLimit({
  windowMs,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: accountKey,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
})];

module.exports = {sendCodeRateLimiter, verifyCodeRateLimiter};
