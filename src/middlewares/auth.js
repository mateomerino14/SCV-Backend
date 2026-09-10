const jwt = require('jsonwebtoken')
const supabase = require('../config/supabase')

// Verifica el token JWT y confirma que el usuario este activo
async function authMiddleware(req, res, next) {
  let token = req.headers['authorization']
  if (!token || !token.startsWith('Bearer ')) {
    return res.status(401).json({error: 'Acceso denegado, token no proporcionado'})
  }
  else {
    try {
      token = token.split(' ')[1]
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET)
      const {data: user} = await supabase
        .from('Usuario')
        .select('id_usuario, activo')
        .eq('id_usuario', decodedToken.id_usuario)
        .single()
      if (!user || !user.activo) {
        return res.status(401).json({error: 'Tu cuenta esta suspendida'})
      }
      else {
        req.user = decodedToken
        next()
      }
    }
    catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({error: 'Token expirado'})
      }
      else {
        return res.status(401).json({error: 'Token invalido'})
      }
    }
  }
}

module.exports = authMiddleware;