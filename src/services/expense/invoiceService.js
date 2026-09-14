const supabase = require('../../config/supabase')
const deadlineService = require('../shared/deadlineService')
const alcoholDetectionService = require('../shared/alcoholDetectionService')
const supplierService = require('./supplierService')
const substitutionService = require('../approval/substitutionService')

const ivaPercentageBolivia = 13

// Asocia o crea el registro de impuesto IVA para una factura
const attachIvaTax = async (invoiceId, ivaAmount) => {
  if (!ivaAmount || parseFloat(ivaAmount) <= 0) {
    return
  }
  const ivaName = `IVA ${ivaPercentageBolivia}%`
  let taxId = null
  const {data: existingTax} = await supabase
    .from('Impuesto')
    .select('id_impuesto')
    .eq('porcentaje', ivaPercentageBolivia)
    .single()
  if (existingTax) {
    taxId = existingTax.id_impuesto
  }
  else {
    const {data: newTax, error: taxError} = await supabase
      .from('Impuesto')
      .insert({nombre: ivaName, porcentaje: ivaPercentageBolivia})
      .select()
      .single()
    if (!taxError) {
      taxId = newTax.id_impuesto
    }
  }
  if (taxId) {
    await supabase.from('Factura_Impuestos').insert({id_factura: invoiceId, id_impuesto: taxId})
  }
};

// Sube el archivo de imagen de la factura y lo asocia al gasto
const uploadInvoiceImage = async (expenseId, file) => {
  const fileExtension = file.originalname.split('.').pop()
  const fileName = `facturas/${expenseId}_${Date.now()}.${fileExtension}`
  const {error: storageError} = await supabase.storage
    .from('facturas')
    .upload(fileName, file.buffer, {contentType: file.mimetype})
  if (!storageError) {
    const {data: urlData} = supabase.storage.from('facturas').getPublicUrl(fileName)
    await supabase.from('Imagen').insert({url_archivo: urlData.publicUrl, id_gasto: expenseId})
  }
};

// Valida los campos requeridos para guardar una factura
const validateInvoiceData = (invoiceData) => {
  if (!invoiceData.proveedor) {
    return 'El nombre del proveedor es requerido'
  }
  if (!invoiceData.numero_factura) {
    return 'El número de factura es requerido'
  }
  if (!invoiceData.fecha_emision) {
    return 'La fecha de emisión es requerida'
  }
  if (!invoiceData.monto_total || isNaN(parseFloat(invoiceData.monto_total))) {
    return 'El monto total es requerido y debe ser un número válido'
  }
  if (!invoiceData.tipo_doc || !['F', 'R'].includes(invoiceData.tipo_doc)) {
    return 'El tipo de documento debe ser Factura (F) o Recibo (R)'
  }
  if (!invoiceData.id_viaje) {
    return 'El viaje asociado es requerido'
  }
  return null
};

// Guarda una nueva factura junto con su gasto, proveedor y detalle
const saveInvoice = async (invoiceData, file, userId) => {
  const validationError = validateInvoiceData(invoiceData)
  if (validationError) {
    return {error: validationError, status: 400}
  }
  const access = await substitutionService.canRegisterExpenseOnTrip(invoiceData.id_viaje, userId)
  if (!access.allowed) {
    return {error: access.error, status: access.status}
  }
  const deadlineValidation = await deadlineService.validateTripDeadline(invoiceData.id_viaje, invoiceData.fecha_emision)
  if (!deadlineValidation.valid) {
    return {error: deadlineValidation.error, status: 400, requiereAutorizacion: !!deadlineValidation.requiereAutorizacion}
  }
  const supplierName = invoiceData.proveedor.trim()
  const {data: existingSupplier} = await supabase
    .from('Proveedor')
    .select('id_proveedor')
    .ilike('nombre', supplierName)
    .limit(1)
    .maybeSingle()
  let supplierId = null
  if (existingSupplier) {
    supplierId = existingSupplier.id_proveedor
    await supplierService.updateSupplierTaxId(supplierId, invoiceData.nit)
  }
  else {
    const {data: newSupplier, error: supplierError} = await supabase
      .from('Proveedor')
      .insert({nombre: supplierName, numero_doc_fiscal: invoiceData.nit || null, tipo_doc_fiscal: supplierService.detectTaxDocType(invoiceData.nit)})
      .select()
      .single()
    if (supplierError) {
      return {error: supplierError.message, status: 500}
    }
    else {
      supplierId = newSupplier?.id_proveedor
    }
  }
  const hasAlcohol = await alcoholDetectionService.analyzeAlcohol(invoiceData.detalle || [])
  const {data: expense, error: expenseError} = await supabase
    .from('Gasto')
    .insert({
      monto_total: invoiceData.monto_total,
      fecha_gasto: invoiceData.fecha_emision,
      descripcion: `Factura ${invoiceData.numero_factura} - ${supplierName}`,
      tipo: invoiceData.tipo_doc,
      modificado: !!invoiceData.modificado_manualmente,
      id_viaje: invoiceData.id_viaje,
      id_proveedor: supplierId,
      id_categoria: invoiceData.id_categoria_gasto || null,
      tiene_alcohol: hasAlcohol,
    })
    .select()
    .single()
  if (expenseError) {
    return {error: expenseError.message, status: 500}
  }
  const {data: invoice, error: invoiceError} = await supabase
    .from('Factura')
    .insert({
      numero_factura: invoiceData.numero_factura,
      fecha_emision: invoiceData.fecha_emision,
      monto_parcial: invoiceData.monto,
      id_gasto: expense.id_gasto,
      id_proveedor: supplierId,
    })
    .select()
    .single()
  if (invoiceError) {
    await supabase.from('Gasto').delete().eq('id_gasto', expense.id_gasto)
    if (invoiceError.code === '23505') {
      return {error: `La factura número ${invoiceData.numero_factura} de este proveedor ya fue registrada para esta fecha`, status: 400}
    }
    else {
      return {error: invoiceError.message, status: 500}
    }
  }
  if (invoiceData.detalle && invoiceData.detalle.length > 0) {
    const detailRows = invoiceData.detalle.map((item) => ({
      nombre_producto: item.nombre_producto,
      cantidad: item.cantidad,
      precio: item.precio,
      id_factura: invoice.id_factura,
    }))
    const {error: detailError} = await supabase.from('Detalle_Factura').insert(detailRows)
    if (detailError) {
      await supabase.from('Factura').delete().eq('id_factura', invoice.id_factura)
      await supabase.from('Gasto').delete().eq('id_gasto', expense.id_gasto)
      return {error: detailError.message, status: 500}
    }
  }
  try {
    await alcoholDetectionService.updateAlcoholInTrip(invoiceData.id_viaje)
  }
  catch (error) {
    console.warn('Error alcohol:', error.message)
  }
  if (!hasAlcohol) {
    await attachIvaTax(invoice.id_factura, invoiceData.iva)
  }
  if (file) {
    await uploadInvoiceImage(expense.id_gasto, file)
  }
  return {expense}
};

// Actualiza una factura existente junto con su gasto, proveedor y detalle
const updateInvoice = async (expenseId, invoiceData, file, userId) => {
  if (!invoiceData.proveedor) {
    return {error: 'El nombre del proveedor es requerido', status: 400}
  }
  if (!invoiceData.fecha_emision) {
    return {error: 'La fecha de emisión es requerida', status: 400}
  }
  if (!invoiceData.monto_total || isNaN(parseFloat(invoiceData.monto_total))) {
    return {error: 'El monto total es requerido', status: 400}
  }
  const {data: existingExpense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).single()
  if (!existingExpense) {
    return {error: 'Gasto no encontrado', status: 404}
  }
  const access = await substitutionService.canRegisterExpenseOnTrip(existingExpense.id_viaje, userId)
  if (!access.allowed) {
    return {error: access.error, status: access.status}
  }
  if (invoiceData.id_viaje) {
    const deadlineValidation = await deadlineService.validateTripDeadline(invoiceData.id_viaje, invoiceData.fecha_emision)
    if (!deadlineValidation.valid) {
      return {error: deadlineValidation.error, status: 400, requiereAutorizacion: !!deadlineValidation.requiereAutorizacion}
    }
  }
  const supplierName = invoiceData.proveedor.trim()
  const {data: existingSupplier} = await supabase
    .from('Proveedor')
    .select('id_proveedor')
    .ilike('nombre', supplierName)
    .limit(1)
    .maybeSingle()
  let supplierId = null
  if (existingSupplier) {
    supplierId = existingSupplier.id_proveedor
    await supplierService.updateSupplierTaxId(supplierId, invoiceData.nit)
  }
  else {
    const {data: newSupplier, error: supplierError} = await supabase
      .from('Proveedor')
      .insert({nombre: supplierName, numero_doc_fiscal: invoiceData.nit || null, tipo_doc_fiscal: supplierService.detectTaxDocType(invoiceData.nit)})
      .select()
      .single()
    if (supplierError) {
      return {error: supplierError.message, status: 500}
    }
    else {
      supplierId = newSupplier?.id_proveedor
    }
  }
  const hasAlcohol = await alcoholDetectionService.analyzeAlcohol(invoiceData.detalle || [])
  const {error: expenseError} = await supabase
    .from('Gasto')
    .update({
      monto_total: parseFloat(invoiceData.monto_total),
      fecha_gasto: invoiceData.fecha_emision,
      descripcion: `Factura ${invoiceData.numero_factura} - ${supplierName}`,
      tipo: invoiceData.tipo_doc,
      modificado: true,
      id_proveedor: supplierId,
      id_categoria: invoiceData.id_categoria_gasto || null,
      tiene_alcohol: hasAlcohol,
    })
    .eq('id_gasto', expenseId)
  if (expenseError) {
    return {error: expenseError.message, status: 500}
  }
  const {data: existingInvoice} = await supabase
    .from('Factura')
    .select('id_factura')
    .eq('id_gasto', expenseId)
    .single()
  if (existingInvoice) {
    const {error: invoiceUpdateError} = await supabase
      .from('Factura')
      .update({
        numero_factura: invoiceData.numero_factura,
        fecha_emision: invoiceData.fecha_emision,
        monto_parcial: invoiceData.monto,
        id_proveedor: supplierId,
      })
      .eq('id_factura', existingInvoice.id_factura)
    if (invoiceUpdateError) {
      if (invoiceUpdateError.code === '23505') {
        return {error: `La factura número ${invoiceData.numero_factura} de este proveedor ya fue registrada para esta fecha`, status: 400}
      }
      else {
        return {error: invoiceUpdateError.message, status: 500}
      }
    }
    await supabase.from('Detalle_Factura').delete().eq('id_factura', existingInvoice.id_factura)
    if (invoiceData.detalle && invoiceData.detalle.length > 0) {
      const detailRows = invoiceData.detalle.map((item) => ({
        nombre_producto: item.nombre_producto,
        cantidad: item.cantidad,
        precio: item.precio,
        id_factura: existingInvoice.id_factura,
      }))
      await supabase.from('Detalle_Factura').insert(detailRows)
    }
    await supabase.from('Factura_Impuestos').delete().eq('id_factura', existingInvoice.id_factura)
    if (!hasAlcohol) {
      await attachIvaTax(existingInvoice.id_factura, invoiceData.iva)
    }
  }
  if (invoiceData.id_viaje) {
    try {
      await alcoholDetectionService.updateAlcoholInTrip(invoiceData.id_viaje)
    }
    catch (error) {
      console.warn('Error alcohol:', error.message)
    }
  }
  if (file && !invoiceData.mantener_imagen) {
    await supabase.from('Imagen').delete().eq('id_gasto', expenseId)
    await uploadInvoiceImage(expenseId, file)
  }
  return {}
};

module.exports = {saveInvoice, updateInvoice};