const supabase = require('../../config/supabase')

// Lista todos los roles
const getAllRoles = async (req, res) => {
  const {data, error} = await supabase.from('Rol').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza un rol existente
const updateRole = async (req, res) => {
  const {data, error} = await supabase.from('Rol').update(req.body).eq('id_rol', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea un nuevo rol
const createRole = async (req, res) => {
  const {data, error} = await supabase.from('Rol').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina un rol existente
const deleteRole = async (req, res) => {
  const {data, error} = await supabase.from('Rol').delete().eq('id_rol', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllRoles, updateRole, createRole, deleteRole};