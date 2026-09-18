const supabase = require('../../config/supabase')
const sectionService = require('../../services/catalog/sectionService')

// Lista todas las secciones
const getAllSections = async (req, res) => {
  const {data, error} = await supabase.from('Seccion').select('*').order('nombre', {ascending: true})
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza una seccion existente, validando que el nombre no este duplicado
const updateSection = async (req, res) => {
  if (req.body.nombre !== undefined) {
    const duplicateError = await sectionService.validateSectionNotDuplicated(req.body.nombre, req.params.id)
    if (duplicateError) {
      return res.status(400).json({error: duplicateError})
    }
  }
  const {data, error} = await supabase.from('Seccion').update(req.body).eq('id_seccion', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea una nueva seccion, validando que el nombre no este duplicado
const createSection = async (req, res) => {
  const duplicateError = await sectionService.validateSectionNotDuplicated(req.body.nombre, null)
  if (duplicateError) {
    return res.status(400).json({error: duplicateError})
  }
  const {data, error} = await supabase.from('Seccion').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina una seccion existente
const deleteSection = async (req, res) => {
  const {data, error} = await supabase.from('Seccion').delete().eq('id_seccion', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Suspende una seccion, marcandola como inactiva
const suspendSection = async (req, res) => {
  const {data, error} = await supabase.from('Seccion').update({activo: false}).eq('id_seccion', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Activa una seccion previamente suspendida
const activateSection = async (req, res) => {
  const {data, error} = await supabase.from('Seccion').update({activo: true}).eq('id_seccion', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllSections, updateSection, createSection, deleteSection, suspendSection, activateSection};
