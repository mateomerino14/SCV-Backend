const supabase = require('../../config/supabase');
const sectionService = require('../../services/catalog/sectionService');
const listQuery = require('../../utils/listQuery');

// Lista las secciones; filtra por nombre o codigo de Oracle y con "page" devuelve una pagina y el total
const getAllSections = async (req, res) => {
  const page = listQuery.pageOf(req.query);
  let count;
  if (page) {
    count = 'exact';
  }
  let query = supabase.from('Seccion').select('*', {count});
  query = listQuery.applySearch(query, req.query.search, ['nombre', 'codigo_seccion']);
  query = query.order('nombre', {ascending: true}).order('id_seccion', {ascending: true});
  if (page) {
    query = query.range(page.from, page.to);
  }
  return listQuery.sendList(res, await query, page);
};

// Actualiza una seccion existente, validando que el nombre no este duplicado y sus codigos de Oracle
const updateSection = async (req, res) => {
  const codesError = sectionService.validateOracleCodes(req.body);
  if (codesError) {
    return res.status(400).json({error: codesError});
  }
  if (req.body.nombre !== undefined) {
    const duplicateError = await sectionService.validateSectionNotDuplicated(req.body.nombre, req.params.id);
    if (duplicateError) {
      return res.status(400).json({error: duplicateError});
    }
  }
  const {data, error} = await supabase.from('Seccion').update(sectionService.pickSectionFields(req.body)).eq('id_seccion', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Crea una nueva seccion, validando que el nombre no este duplicado y sus codigos de Oracle
const createSection = async (req, res) => {
  const codesError = sectionService.validateOracleCodes(req.body);
  if (codesError) {
    return res.status(400).json({error: codesError});
  }
  const duplicateError = await sectionService.validateSectionNotDuplicated(req.body.nombre, null);
  if (duplicateError) {
    return res.status(400).json({error: duplicateError});
  }
  const {data, error} = await supabase.from('Seccion').insert(sectionService.pickSectionFields(req.body)).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Elimina una seccion existente
const deleteSection = async (req, res) => {
  const {data, error} = await supabase.from('Seccion').delete().eq('id_seccion', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Suspende una seccion, marcandola como inactiva
const suspendSection = async (req, res) => {
  const {data, error} = await supabase.from('Seccion').update({activo: false}).eq('id_seccion', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Activa una seccion previamente suspendida
const activateSection = async (req, res) => {
  const {data, error} = await supabase.from('Seccion').update({activo: true}).eq('id_seccion', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

module.exports = {getAllSections, updateSection, createSection, deleteSection, suspendSection, activateSection};
