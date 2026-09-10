const supabase = require('../../config/supabase')

// Lista todas las categorias de gasto
const getAllExpenseCategories = async (req, res) => {
  const {data, error} = await supabase.from('Categoria_Gasto').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea una nueva categoria de gasto
const createExpenseCategory = async (req, res) => {
  const {data, error} = await supabase.from('Categoria_Gasto').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllExpenseCategories, createExpenseCategory};