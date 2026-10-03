const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const tokenService = require('../services/user/tokenService');

// Rutas permitidas mientras el usuario tiene pendiente el cambio de contrasena
const allowedWhilePasswordChangePending = ['/user/me', '/user/me/change-password'];

const sessionInvalidatedMessage = 'Sesión invalidada, vuelve a iniciar sesión';

// Verifica el token y que el usuario siga activo, con el mismo rol y sin cambio de clave pendiente
async function authMiddleware(req, res, next) {
  let token = req.headers['authorization'];
  if (!token || !token.startsWith('Bearer ')) {
    return res.status(401).json({error: 'Acceso denegado, token no proporcionado'});
  }
  let decodedToken = null;
  try {
    token = token.split(' ')[1];
    decodedToken = jwt.verify(token, process.env.JWT_SECRET);
  }
  catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({error: 'Token expirado'});
    }
    return res.status(401).json({error: 'Token inválido'});
  }
  const {data: user} = await supabase
    .from('Usuario')
    .select('id_usuario, activo, id_rol, refresh_token_invalido_desde, debe_cambiar_contrasenia, motivo_cambio_contrasenia, ultima_cambio_contrasenia')
    .eq('id_usuario', decodedToken.id_usuario)
    .single();
  if (!user || !user.activo) {
    return res.status(401).json({error: 'Tu cuenta esta suspendida'});
  }
  // Sesion invalidada (cambio de rol o suspension) despues de emitir el token; iat se compara al segundo
  const invalidatedAfterIssue = user.refresh_token_invalido_desde &&
    decodedToken.iat < Math.floor(new Date(user.refresh_token_invalido_desde).getTime() / 1000);
  if (invalidatedAfterIssue || user.id_rol !== decodedToken.id_rol) {
    return res.status(401).json({error: sessionInvalidatedMessage});
  }
  const route = `${req.baseUrl}${req.path}`.replace(/\/$/, '');
  if (tokenService.getPasswordChangeReason(user) && !allowedWhilePasswordChangePending.includes(route)) {
    return res.status(403).json({error: 'Debes cambiar tu contraseña para continuar', codigo: 'CAMBIO_CONTRASENIA_REQUERIDO'});
  }
  req.user = decodedToken;
  next();
}

module.exports = authMiddleware;
