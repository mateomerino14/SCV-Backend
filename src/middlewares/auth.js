const jwt = require('jsonwebtoken')
const supabase = require('../config/supabase')

async function authMiddleware(req, res, next) {
  let token = req.headers['authorization']
  if (!token || !token.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado, token no proporcionado' })
  }
  try {
    token = token.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const { data: usuario } = await supabase
      .from('Usuario')
      .select('id_usuario, activo')
      .eq('id_usuario', decoded.id_usuario)
      .single()

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Tu cuenta está suspendida' })
    }

    req.user = decoded
    next()
  } catch (error) {
    return res.status(400).json({ error: 'Token inválido' })
  }
}

module.exports = authMiddleware;