const {rateLimit, ipKeyGenerator} = require('express-rate-limit');

const windowMs = 15 * 60 * 1000;

// Arma la clave de la cuenta: IP mas correo, para que los errores de uno no bloqueen a los demas de la misma red
const accountKey = (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email_corporativo || '').trim().toLowerCase()}`;

// Limita los intentos fallidos de una cuenta desde una misma IP; los ingresos correctos no cuentan
const loginAccountRateLimiter = rateLimit({
  windowMs,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: accountKey,
  message: {error: 'Demasiados intentos de inicio de sesión con esta cuenta. Espera 15 minutos antes de volver a intentar.'},
  standardHeaders: true,
  legacyHeaders: false,
});

// Tope alto por IP contra quien prueba muchas cuentas distintas; una oficina entera no llega a el por errores normales
const loginIpRateLimiter = rateLimit({
  windowMs,
  max: 100,
  skipSuccessfulRequests: true,
  message: {error: 'Demasiados intentos de inicio de sesión desde esta red. Espera 15 minutos antes de volver a intentar.'},
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = [loginIpRateLimiter, loginAccountRateLimiter];
