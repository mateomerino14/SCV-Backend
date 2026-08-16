const invoiceExtractionService = require('../../services/expense/invoiceExtractionService')
const invoiceService = require('../../services/expense/invoiceService')

// Extrae los datos de una factura a partir de una imagen subida
const extractInvoice = async (req, res) => {
  try {
    const extractedData = await invoiceExtractionService.extractInvoiceData(req.file)
    return res.json(extractedData)
  }
  catch (error) {
    console.log('Error extrayendo factura:', error)
    return res.status(500).json({error: 'Error al procesar la factura'})
  }
};

// Guarda una nueva factura
const saveInvoice = async (req, res) => {
  try {
    const invoiceData = JSON.parse(req.body.datos)
    const result = await invoiceService.saveInvoice(invoiceData, req.file)
    if (result.error) {
      return res.status(result.status || 500).json({error: result.error, requiereAutorizacion: result.requiereAutorizacion})
    }
    else {
      return res.json({message: 'Factura guardada correctamente', gasto: result.expense})
    }
  }
  catch (error) {
    console.log('Error guardando factura:', error.message)
    return res.status(500).json({error: error.message || 'Error al guardar la factura'})
  }
};

// Actualiza una factura existente
const updateInvoice = async (req, res) => {
  try {
    const invoiceData = JSON.parse(req.body.datos)
    const {expenseId} = req.params
    const result = await invoiceService.updateInvoice(expenseId, invoiceData, req.file)
    if (result.error) {
      return res.status(result.status || 500).json({error: result.error, requiereAutorizacion: result.requiereAutorizacion})
    }
    else {
      return res.json({message: 'Factura actualizada correctamente'})
    }
  }
  catch (error) {
    console.log('Error actualizando factura:', error.message)
    return res.status(500).json({error: error.message || 'Error al actualizar la factura'})
  }
};

module.exports = {extractInvoice, saveInvoice, updateInvoice};