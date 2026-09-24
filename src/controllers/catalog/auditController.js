const supabase = require('../../config/supabase')

// Lista los registros de auditoria, con el nombre del usuario y filtros opcionales
const getAllAudits = async (req, res) => {
  let query = supabase
    .from('Auditoria')
    .select('id_auditoria, fecha, tipo, Usuario(id_usuario, nombre, apellido_paterno, email_corporativo)')
  if (req.query.tipo) {
    query = query.eq('tipo', req.query.tipo)
  }
  if (req.query.id_usuario) {
    query = query.eq('id_usuario', req.query.id_usuario)
  }
  if (req.query.fecha_inicio) {
    query = query.gte('fecha', req.query.fecha_inicio)
  }
  if (req.query.fecha_fin) {
    query = query.lte('fecha', `${req.query.fecha_fin}T23:59:59`)
  }
  const {data, error} = await query.order('fecha', {ascending: false})
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