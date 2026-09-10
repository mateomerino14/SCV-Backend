const supabase = require('../config/supabase')
const textNormalizer = require('../utils/textNormalizer')
const userDirectoryService = require('../services/user/userDirectoryService')

// Permite el acceso solo a usuarios con el cargo de tesorero, sin importar su rol
async function requireTreasurerPosition(req, res, next) {
  const {data: user} = await supabase
    .from('Usuario')
    .select('id_usuario, Cargo(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single()
  if (!user || textNormalizer.normalizeText(user.Cargo?.nombre || '') !== textNormalizer.normalizeText(userDirectoryService.treasurerPositionName)) {
    return res.status(403).json({error: 'No tienes el cargo requerido para acceder a esta sección'})
  }
  else {
    next()
  }
}

module.exports = requireTreasurerPosition;