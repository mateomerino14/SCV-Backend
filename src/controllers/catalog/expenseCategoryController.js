const supabase = require('../../config/supabase');

// Lista todas las categorias de gasto
const getAllExpenseCategories = async (req, res) => {
  const {data, error} = await supabase.from('Categoria_Gasto').select('*');
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Crea una nueva categoria de gasto
// Solo se aceptan los campos de la categoria (no ids ni otras columnas enviadas por el cliente)
const createExpenseCategory = async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre || nombre.length > 50) {
    return res.status(400).json({error: 'El nombre de la categoría es requerido y no puede superar los 50 caracteres'});
  }
  const category = {nombre};
  if (req.body?.requiere_comprobante !== undefined) {
    category.requiere_comprobante = !!req.body.requiere_comprobante;
  }
  const {data, error} = await supabase.from('Categoria_Gasto').insert(category).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

module.exports = {getAllExpenseCategories, createExpenseCategory};