const supabase = require('../../config/supabase');
const positionService = require('../../services/catalog/positionService');

// Lista todos los cargos con las tarifas de su tipo de la escala
const getAllPositions = async (req, res) => {
  const {data, error} = await supabase.from('Cargo').select('id_cargo, nombre, tipo_viatico, activo, Escala_Viatico(*)').order('nombre', {ascending: true});
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Actualiza el nombre o el tipo de la escala de un cargo, validando que el nombre no este duplicado
const updatePosition = async (req, res) => {
  const picked = positionService.pickPositionFields(req.body, false);
  if (picked.error) {
    return res.status(400).json({error: picked.error});
  }
  if (req.body.nombre !== undefined) {
    const duplicateError = await positionService.validatePositionNotDuplicated(req.body.nombre, req.params.id);
    if (duplicateError) {
      return res.status(400).json({error: duplicateError});
    }
  }
  const {data, error} = await supabase.from('Cargo').update(picked.fields).eq('id_cargo', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Crea un nuevo cargo con su tipo de la escala, validando que el nombre no este duplicado
const createPosition = async (req, res) => {
  const picked = positionService.pickPositionFields(req.body, true);
  if (picked.error) {
    return res.status(400).json({error: picked.error});
  }
  const duplicateError = await positionService.validatePositionNotDuplicated(req.body.nombre, null);
  if (duplicateError) {
    return res.status(400).json({error: duplicateError});
  }
  const {data, error} = await supabase.from('Cargo').insert(picked.fields).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Elimina un cargo existente
const deletePosition = async (req, res) => {
  const {data, error} = await supabase.from('Cargo').delete().eq('id_cargo', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Suspende un cargo, marcandolo como inactivo
const suspendPosition = async (req, res) => {
  const {data, error} = await supabase.from('Cargo').update({activo: false}).eq('id_cargo', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Activa un cargo previamente suspendido
const activatePosition = async (req, res) => {
  const {data, error} = await supabase.from('Cargo').update({activo: true}).eq('id_cargo', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

module.exports = {getAllPositions, updatePosition, createPosition, deletePosition, suspendPosition, activatePosition};