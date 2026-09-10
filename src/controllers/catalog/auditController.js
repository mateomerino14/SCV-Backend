const supabase = require('../../config/supabase')

// Lista todos los registros de auditoria
const getAllAudits = async (req, res) => {
  const {data, error} = await supabase.from('Auditoria').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea un nuevo registro de auditoria
const createAudit = async (req, res) => {
  const {data, error} = await supabase.from('Auditoria').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina un registro de auditoria
const deleteAudit = async (req, res) => {
  const {data, error} = await supabase.from('Auditoria').delete().eq('id_auditoria', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllAudits, createAudit, deleteAudit};