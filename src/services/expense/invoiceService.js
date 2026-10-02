const supabase = require('../../config/supabase')
const expenseService = require('./expenseService')
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
// Sube la imagen de la factura y devuelve su URL publica (o un error). Se llama antes de
// escribir, para no dejar una factura sin comprobante si la subida falla.
const uploadInvoiceImage = async (file) => {
  const fileExtension = file.originalname.split('.').pop()
  const fileName = `facturas/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExtension}`
  const {error: storageError} = await supabase.storage
    .from('facturas')
    .upload(fileName, file.buffer, {contentType: file.mimetype})
  if (storageError) {
    return {error: 'No se pudo subir el comprobante de la factura. Intenta nuevamente.'}
  }
  return {url: supabase.storage.from('facturas').getPublicUrl(fileName).data.publicUrl}
};

// Valida los campos requeridos para guardar una factura
// Cada producto de la factura con nombre, cantidad mayor a cero y precio no negativo
const validateInvoiceLines = (lines) => {
  for (const item of lines) {
    if (!String(item?.nombre_producto || '').trim()) {
      return 'Cada producto de la factura debe tener un nombre'
    }
    if (!(parseFloat(item.cantidad) > 0) || isNaN(parseFloat(item.precio)) || parseFloat(item.precio) < 0) {
      return 'Cada producto debe tener una cantidad mayor a cero y un precio válido'
    }
  }
  return null
}

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
  if (!invoiceData.monto_total || isNaN(parseFloat(invoiceData.monto_total)) || parseFloat(invoiceData.monto_total) <= 0) {
    return 'El monto total es requerido y debe ser mayor a cero'
  }
  const amountWithoutTax = parseFloat(invoiceData.monto)
  if (isNaN(amountWithoutTax) || amountWithoutTax <= 0 || amountWithoutTax > parseFloat(invoiceData.monto_total)) {
    return 'El monto sin impuestos es requerido, mayor a cero y no puede superar el monto total'
  }
  if (!invoiceData.tipo_doc || !['F', 'R'].includes(invoiceData.tipo_doc)) {
    return 'El tipo de documento debe ser Factura (F) o Recibo (R)'
  }
  if (!invoiceData.id_viaje) {
    return 'El viaje asociado es requerido'
  }
  if (!Array.isArray(invoiceData.detalle) || invoiceData.detalle.length === 0) {
    return 'Debes agregar al menos un producto al detalle de la factura'
  }
  return validateInvoiceLines(invoiceData.detalle)
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
  // Las facturas son en bolivianos: en un viaje internacional solo valen el primer y el ultimo dia
  const currencyError = expenseService.validateCurrencyByDay(access.trip, invoiceData.fecha_emision, false)
  if (currencyError) {
    return {error: currencyError, status: 400}
  }
  const deadlineValidation = await deadlineService.validateTripDeadline(invoiceData.id_viaje, invoiceData.fecha_emision)
  if (!deadlineValidation.valid) {
    return {error: deadlineValidation.error, status: 400, requiereAutorizacion: !!deadlineValidation.requiereAutorizacion}
  }
  let imageUrl = null
  if (file) {
    const upload = await uploadInvoiceImage(file)
    if (upload.error) {
      return {error: upload.error, status: 500}
    }
    imageUrl = upload.url
  }
  const supplierName = invoiceData.proveedor.trim()
  const {data: existingSupplier} = await supabase
    .from('Proveedor')
    .select('id_proveedor')
    .ilike('nombre', supplierService.toExactNamePattern(supplierName))
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
      es_gasto_internacional: false,
      moneda: 'BOB',
      monto_moneda_origen: parseFloat(invoiceData.monto_total),
      // Factura o recibo: sin retenciones, el costo es el monto completo
      ...expenseService.calculateRetentions(invoiceData.monto_total, invoiceData.tipo_doc, false, hasAlcohol),
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
  if (imageUrl) {
    await supabase.from('Imagen').insert({url_archivo: imageUrl, id_gasto: expense.id_gasto})
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
  if (!invoiceData.monto_total || isNaN(parseFloat(invoiceData.monto_total)) || parseFloat(invoiceData.monto_total) <= 0) {
    return {error: 'El monto total es requerido y debe ser mayor a cero', status: 400}
  }
  if (!Array.isArray(invoiceData.detalle) || invoiceData.detalle.length === 0) {
    return {error: 'Debes agregar al menos un producto al detalle de la factura', status: 400}
  }
  const linesError = validateInvoiceLines(invoiceData.detalle)
  if (linesError) {
    return {error: linesError, status: 400}
  }
  const amountWithoutTax = parseFloat(invoiceData.monto)
  if (isNaN(amountWithoutTax) || amountWithoutTax <= 0 || amountWithoutTax > parseFloat(invoiceData.monto_total)) {
    return {error: 'El monto sin impuestos es requerido, mayor a cero y no puede superar el monto total', status: 400}
  }
  const {data: existingExpense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).maybeSingle()
  if (!existingExpense) {
    return {error: 'Gasto no encontrado', status: 404}
  }
  // Solo se editan por aqui los gastos que son facturas
  const {data: existingInvoice} = await supabase.from('Factura').select('id_factura').eq('id_gasto', expenseId).maybeSingle()
  if (!existingInvoice) {
    return {error: 'Este gasto no es una factura', status: 400}
  }
  if (!file && !invoiceData.mantener_imagen) {
    return {error: 'Debes subir el comprobante de la factura', status: 400}
  }
  const access = await substitutionService.canRegisterExpenseOnTrip(existingExpense.id_viaje, userId)
  if (!access.allowed) {
    return {error: access.error, status: access.status}
  }
  const currencyError = expenseService.validateCurrencyByDay(access.trip, invoiceData.fecha_emision, false)
  if (currencyError) {
    return {error: currencyError, status: 400}
  }
  // Siempre con el viaje real del gasto (no el que envie el cliente) para que no se salte el plazo
  const deadlineValidation = await deadlineService.validateTripDeadline(existingExpense.id_viaje, invoiceData.fecha_emision)
  if (!deadlineValidation.valid) {
    return {error: deadlineValidation.error, status: 400, requiereAutorizacion: !!deadlineValidation.requiereAutorizacion}
  }
  let newImageUrl = null
  if (file && !invoiceData.mantener_imagen) {
    const upload = await uploadInvoiceImage(file)
    if (upload.error) {
      return {error: upload.error, status: 500}
    }
    newImageUrl = upload.url
  }
  const supplierName = invoiceData.proveedor.trim()
  const {data: existingSupplier} = await supabase
    .from('Proveedor')
    .select('id_proveedor')
    .ilike('nombre', supplierService.toExactNamePattern(supplierName))
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
  // Numero de factura repetido para el mismo proveedor y fecha: se avisa antes de cambiar nada
  const {data: duplicateInvoice} = await supabase
    .from('Factura')
    .select('id_factura')
    .eq('numero_factura', invoiceData.numero_factura)
    .eq('fecha_emision', invoiceData.fecha_emision)
    .eq('id_proveedor', supplierId)
    .neq('id_factura', existingInvoice.id_factura)
    .limit(1)
  if ((duplicateInvoice || []).length > 0) {
    return {error: `La factura número ${invoiceData.numero_factura} de este proveedor ya fue registrada para esta fecha`, status: 400}
  }
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
      monto_moneda_origen: parseFloat(invoiceData.monto_total),
      ...expenseService.calculateRetentions(invoiceData.monto_total, invoiceData.tipo_doc || 'F', false, hasAlcohol),
    })
    .eq('id_gasto', expenseId)
  if (expenseError) {
    return {error: expenseError.message, status: 500}
  }
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
  try {
    await alcoholDetectionService.updateAlcoholInTrip(existingExpense.id_viaje)
  }
  catch (error) {
    console.warn('Error alcohol:', error.message)
  }
  if (newImageUrl) {
    await supabase.from('Imagen').delete().eq('id_gasto', expenseId)
    await supabase.from('Imagen').insert({url_archivo: newImageUrl, id_gasto: expenseId})
  }
  return {}
};

module.exports = {saveInvoice, updateInvoice};