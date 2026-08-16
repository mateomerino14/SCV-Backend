const supabase = require('../../config/supabase')

// Lista todos los detalles de factura
const getAllInvoiceDetails = async (req, res) => {
  const {data, error} = await supabase.from('Detalle_Factura').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza un detalle de factura existente
const updateInvoiceDetail = async (req, res) => {
  const {data, error} = await supabase.from('Detalle_Factura').update(req.body).eq('id_detalle', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea un nuevo detalle de factura
const createInvoiceDetail = async (req, res) => {
  const {data, error} = await supabase.from('Detalle_Factura').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina un detalle de factura existente
const deleteInvoiceDetail = async (req, res) => {
  const {data, error} = await supabase.from('Detalle_Factura').delete().eq('id_detalle', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllInvoiceDetails, updateInvoiceDetail, createInvoiceDetail, deleteInvoiceDetail};