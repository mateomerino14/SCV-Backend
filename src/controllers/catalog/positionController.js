const supabase = require('../../config/supabase')
const positionService = require('../../services/catalog/positionService')

// Lista todos los cargos
const getAllPositions = async (req, res) => {
  const {data, error} = await supabase.from('Cargo').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza un cargo existente, validando que el nombre no este duplicado
const updatePosition = async (req, res) => {
  if (req.body.nombre !== undefined) {
    const duplicateError = await positionService.validatePositionNotDuplicated(req.body.nombre, req.params.id)
    if (duplicateError) {
      return res.status(400).json({error: duplicateError})
    }
  }
  const {data, error} = await supabase.from('Cargo').update(req.body).eq('id_cargo', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea un nuevo cargo, validando que el nombre no este duplicado
const createPosition = async (req, res) => {
  const duplicateError = await positionService.validatePositionNotDuplicated(req.body.nombre, null)
  if (duplicateError) {
    return res.status(400).json({error: duplicateError})
  }
  const {data, error} = await supabase.from('Cargo').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina un cargo existente
const deletePosition = async (req, res) => {
  const {data, error} = await supabase.from('Cargo').delete().eq('id_cargo', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Suspende un cargo, marcandolo como inactivo
const suspendPosition = async (req, res) => {
  const {data, error} = await supabase.from('Cargo').update({activo: false}).eq('id_cargo', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Activa un cargo previamente suspendido
const activatePosition = async (req, res) => {
  const {data, error} = await supabase.from('Cargo').update({activo: true}).eq('id_cargo', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllPositions, updatePosition, createPosition, deletePosition, suspendPosition, activatePosition};