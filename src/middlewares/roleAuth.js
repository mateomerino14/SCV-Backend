const supabase = require('../config/supabase')

// Crea un middleware que permite el acceso solo a los roles indicados
const checkRole = (allowedRoles) => {
  return async (req, res, next) => {
    const {data: role, error} = await supabase.from('Rol').select('nombre').eq('id_rol', req.user.id_rol).single()
    if (error) {
      return res.status(500).json({error: 'Error al verificar el rol'})
    }
    else if (allowedRoles.includes(role.nombre)) {
      next()
    }
    else {
      return res.status(402).json({error: 'Acceso denegado, rol no permitido'})
    }
  }
};

module.exports = checkRole;