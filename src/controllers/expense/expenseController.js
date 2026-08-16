const supabase = require('../../config/supabase')
const expenseService = require('../../services/expense/expenseService')
const receiptService = require('../../services/expense/receiptService')

// Obtiene el detalle completo de un gasto
const getExpenseDetail = async (req, res) => {
  try {
    const {expenseId} = req.params
    const {data, error} = await supabase
      .from('Gasto')
      .select(`
        *,
        Categoria_Gasto(nombre),
        Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal),
        Factura(
          id_factura,
          numero_factura,
          fecha_emision,
          monto_parcial,
          Detalle_Factura(nombre_producto, cantidad, precio),
          Factura_Impuestos(
            Impuesto(porcentaje, nombre)
          )
        ),
        Imagen(url_archivo),
        Gasto_Tramo_Moneda(id_tramo, moneda, monto_origen, tipo_cambio, monto_usd),
        Gasto_Subitem(id_subitem, descripcion, monto)
      `)
      .eq('id_gasto', expenseId)
      .single()
    if (error) {
      return res.status(500).json({error: error.message})
    }
    if (!data) {
      return res.status(404).json({error: 'Gasto no encontrado'})
    }
    return res.json(data)
  }
  catch (error) {
    return res.status(500).json({error: error.message})
  }
};

// Genera y envia el recibo agrupado de un viaje por tipo de gasto
const sendGroupedReceipt = async (req, res) => {
  try {
    const {tripId, type} = req.params
    const isInternational = req.query.internacional === 'true'
    const result = await receiptService.sendGroupedReceipt(tripId, type, isInternational)
    if (result.error) {
      return res.status(result.status || 500).json({error: result.error})
    }
    return res.json(result)
  }
  catch (error) {
    console.log('Error generando recibo agrupado:', error.message)
    return res.status(500).json({error: error.message || 'Error al generar el recibo'})
  }
};

// Genera y envia el recibo individual de un gasto
const sendIndividualReceipt = async (req, res) => {
  try {
    const {expenseId} = req.params
    const result = await receiptService.sendIndividualReceipt(expenseId)
    if (result.error) {
      return res.status(result.status || 500).json({error: result.error})
    }
    return res.json(result)
  }
  catch (error) {
    console.log('Error generando recibo individual:', error.message)
    return res.status(500).json({error: error.message || 'Error al generar el recibo'})
  }
};

// Registra un nuevo gasto
const registerExpense = async (req, res) => {
  try {
    const expenseData = JSON.parse(req.body.datos)
    const result = await expenseService.createExpense(expenseData, req.file)
    if (result.error) {
      return res.status(result.status || 500).json({error: result.error, requiereAutorizacion: result.requiereAutorizacion})
    }
    return res.json({message: 'Gasto registrado correctamente', gasto: result.expense})
  }
  catch (error) {
    return res.status(500).json({error: error.message})
  }
};

// Actualiza un gasto existente
const updateExpense = async (req, res) => {
  try {
    const expenseData = JSON.parse(req.body.datos)
    const {expenseId} = req.params
    const result = await expenseService.updateExpense(expenseId, expenseData, req.file)
    if (result.error) {
      return res.status(result.status || 500).json({error: result.error})
    }
    return res.json({message: 'Gasto actualizado correctamente'})
  }
  catch (error) {
    return res.status(500).json({error: error.message})
  }
};

// Elimina un gasto existente
const deleteExpense = async (req, res) => {
  try {
    const {expenseId} = req.params
    const result = await expenseService.deleteExpense(expenseId)
    if (result.error) {
      return res.status(result.status || 500).json({error: result.error})
    }
    return res.json({message: 'Gasto eliminado correctamente'})
  }
  catch (error) {
    return res.status(500).json({error: error.message || 'Error al eliminar el gasto'})
  }
};

module.exports = {getExpenseDetail, sendGroupedReceipt, sendIndividualReceipt, registerExpense, updateExpense, deleteExpense};