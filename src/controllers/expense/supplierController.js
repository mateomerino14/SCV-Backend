const supabase = require('../../config/supabase')

// Lista todos los proveedores
const getAllSuppliers = async (req, res) => {
  const {data, error} = await supabase.from('Proveedor').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza un proveedor existente
const updateSupplier = async (req, res) => {
  const {data, error} = await supabase.from('Proveedor').update(req.body).eq('id_proveedor', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea un nuevo proveedor
const createSupplier = async (req, res) => {
  const {data, error} = await supabase.from('Proveedor').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina un proveedor existente
const deleteSupplier = async (req, res) => {
  const {data, error} = await supabase.from('Proveedor').delete().eq('id_proveedor', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllSuppliers, updateSupplier, createSupplier, deleteSupplier};