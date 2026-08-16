const supabase = require('../../config/supabase')

// Lista todos los impuestos
const getAllTaxes = async (req, res) => {
  const {data, error} = await supabase.from('Impuesto').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza un impuesto existente
const updateTax = async (req, res) => {
  const {data, error} = await supabase.from('Impuesto').update(req.body).eq('id_impuesto', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea un nuevo impuesto
const createTax = async (req, res) => {
  const {data, error} = await supabase.from('Impuesto').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina un impuesto existente
const deleteTax = async (req, res) => {
  const {data, error} = await supabase.from('Impuesto').delete().eq('id_impuesto', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllTaxes, updateTax, createTax, deleteTax};