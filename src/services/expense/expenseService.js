const supabase = require('../../config/supabase')
const deadlineService = require('../shared/deadlineService')
const alcoholDetectionService = require('../shared/alcoholDetectionService')
const supplierService = require('./supplierService')

// Calcula las retenciones aplicables segun el monto, tipo de gasto y si es internacional
// Los gastos con alcohol pierden el credito fiscal y las retenciones: se imputan completos como costo
const calculateRetentions = (amount, type, isInternational, hasAlcohol) => {
  const amountNum = parseFloat(amount)
  if (hasAlcohol || isInternational || type === 'F' || type === 'R') {
    return {base_imponible: amountNum, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: amountNum}
  }
  if (type === 'C') {
    const base = parseFloat((amountNum / 0.92).toFixed(2))
    const iue = parseFloat((base * 0.05).toFixed(2))
    const it = parseFloat((base * 0.03).toFixed(2))
    return {base_imponible: base, retencion_rc_iva: 0, retencion_iue: iue, retencion_it: it, importe_costo: base}
  }
  if (type === 'S') {
    const base = parseFloat((amountNum / 0.84).toFixed(2))
    const rcIva = parseFloat((base * 0.13).toFixed(2))
    const it = parseFloat((base * 0.03).toFixed(2))
    return {base_imponible: base, retencion_rc_iva: rcIva, retencion_iue: 0, retencion_it: it, importe_costo: base}
  }
  return {base_imponible: amountNum, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: amountNum}
};

// Calcula el monto total a partir de un arreglo de subitems
const calculateAmountFromSubitems = (subItems) => {
  if (!Array.isArray(subItems) || subItems.length === 0) {
    return null
  }
  return parseFloat(subItems.reduce((sum, item) => sum + parseFloat(item.monto || 0), 0).toFixed(2))
};

// Crea un gasto nuevo, con sus tramos de moneda, subitems e imagen asociada
const createExpense = async (expenseData, file) => {
  if (!expenseData.id_viaje) {
    return {error: 'El viaje es requerido', status: 400}
  }
  const isInternational = expenseData.es_gasto_internacional || false
  const usesSegments = isInternational && Array.isArray(expenseData.tramos) && expenseData.tramos.length > 0
  const usesSubItems = Array.isArray(expenseData.subitems) && expenseData.subitems.length > 0
  let totalAmount = parseFloat(expenseData.monto_total)
  if (!isInternational && usesSubItems) {
    const subItemsAmount = calculateAmountFromSubitems(expenseData.subitems)
    if (subItemsAmount !== null) {
      totalAmount = subItemsAmount
    }
  }
  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    return {error: 'El monto es requerido', status: 400}
  }
  if (expenseData.fecha_gasto) {
    const deadlineValidation = await deadlineService.validateTripDeadline(expenseData.id_viaje, expenseData.fecha_gasto)
    if (!deadlineValidation.valid) {
      return {error: deadlineValidation.error, status: 400, requiereAutorizacion: !!deadlineValidation.requiereAutorizacion}
    }
  }
  const supplierId = await supplierService.findOrCreateSupplier(expenseData.proveedor)
  const type = expenseData.tipo || 'S'
  const alcoholText = [expenseData.descripcion, ...(usesSubItems ? expenseData.subitems.map((item) => item.descripcion) : [])].join(' ')
  const hasAlcohol = await alcoholDetectionService.analyzeAlcoholText(alcoholText)
  const retentions = calculateRetentions(totalAmount, type, isInternational, hasAlcohol)
  let firstSegment = null
  if (usesSegments) {
    firstSegment = expenseData.tramos[0]
  }
  let originAmountSum = expenseData.monto_moneda_origen || totalAmount
  if (usesSegments) {
    originAmountSum = expenseData.tramos.reduce((sum, segment) => sum + parseFloat(segment.monto_origen), 0)
  }
  const {data: expense, error: expenseError} = await supabase
    .from('Gasto')
    .insert({
      monto_total: totalAmount,
      fecha_gasto: expenseData.fecha_gasto,
      descripcion: expenseData.descripcion || '',
      tipo: type,
      id_viaje: expenseData.id_viaje,
      id_categoria: expenseData.id_categoria_gasto || null,
      id_proveedor: supplierId,
      moneda: firstSegment?.moneda || expenseData.moneda || 'USD',
      tipo_cambio: firstSegment ? parseFloat(firstSegment.tipo_cambio) : (expenseData.tipo_cambio || 1),
      monto_moneda_origen: originAmountSum,
      es_gasto_internacional: isInternational,
      base_imponible: retentions.base_imponible,
      retencion_rc_iva: retentions.retencion_rc_iva,
      retencion_iue: retentions.retencion_iue,
      retencion_it: retentions.retencion_it,
      importe_costo: retentions.importe_costo,
      tiene_alcohol: hasAlcohol,
    })
    .select()
    .single()
  if (expenseError) {
    return {error: expenseError.message, status: 500}
  }
  if (usesSegments) {
    const segmentRows = expenseData.tramos.map((segment) => ({
      id_gasto: expense.id_gasto,
      moneda: segment.moneda.trim().toUpperCase(),
      monto_origen: parseFloat(segment.monto_origen),
      tipo_cambio: parseFloat(segment.tipo_cambio),
      monto_usd: parseFloat((parseFloat(segment.monto_origen) / parseFloat(segment.tipo_cambio)).toFixed(2)),
    }))
    const {error: segmentsError} = await supabase.from('Gasto_Tramo_Moneda').insert(segmentRows)
    if (segmentsError) {
      await supabase.from('Gasto').delete().eq('id_gasto', expense.id_gasto)
      return {error: segmentsError.message, status: 500}
    }
  }
  if (usesSubItems) {
    const subItemRows = expenseData.subitems
      .filter((item) => item.descripcion?.trim() && parseFloat(item.monto) > 0)
      .map((item) => ({
        id_gasto: expense.id_gasto,
        descripcion: item.descripcion.trim(),
        monto: parseFloat(item.monto),
      }))
    if (subItemRows.length > 0) {
      const {error: subItemsError} = await supabase.from('Gasto_Subitem').insert(subItemRows)
      if (subItemsError) {
        await supabase.from('Gasto').delete().eq('id_gasto', expense.id_gasto)
        return {error: subItemsError.message, status: 500}
      }
    }
  }
  if (file) {
    const fileExtension = file.originalname.split('.').pop()
    const fileName = `gastos/${expense.id_gasto}_${Date.now()}.${fileExtension}`
    const {error: storageError} = await supabase.storage.from('facturas').upload(fileName, file.buffer, {contentType: file.mimetype})
    if (!storageError) {
      const {data: urlData} = supabase.storage.from('facturas').getPublicUrl(fileName)
      await supabase.from('Imagen').insert({url_archivo: urlData.publicUrl, id_gasto: expense.id_gasto})
    }
  }
  alcoholDetectionService.updateAlcoholInTrip(expenseData.id_viaje).catch((error) => console.warn('Error alcohol:', error.message))
  return {expense}
};

// Actualiza un gasto existente, reemplazando sus tramos de moneda, subitems e imagen
const updateExpense = async (expenseId, expenseData, file) => {
  const isInternational = expenseData.es_gasto_internacional || false
  const usesSegments = isInternational && Array.isArray(expenseData.tramos) && expenseData.tramos.length > 0
  const usesSubItems = Array.isArray(expenseData.subitems) && expenseData.subitems.length > 0
  let totalAmount = parseFloat(expenseData.monto_total)
  if (!isInternational && usesSubItems) {
    const subItemsAmount = calculateAmountFromSubitems(expenseData.subitems)
    if (subItemsAmount !== null) {
      totalAmount = subItemsAmount
    }
  }
  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    return {error: 'El monto es requerido', status: 400}
  }
  const supplierId = await supplierService.findOrCreateSupplier(expenseData.proveedor)
  const type = expenseData.tipo || 'S'
  const alcoholText = [expenseData.descripcion, ...(usesSubItems ? expenseData.subitems.map((item) => item.descripcion) : [])].join(' ')
  const hasAlcohol = await alcoholDetectionService.analyzeAlcoholText(alcoholText)
  const retentions = calculateRetentions(totalAmount, type, isInternational, hasAlcohol)
  let firstSegment = null
  if (usesSegments) {
    firstSegment = expenseData.tramos[0]
  }
  let originAmountSum = expenseData.monto_moneda_origen || totalAmount
  if (usesSegments) {
    originAmountSum = expenseData.tramos.reduce((sum, segment) => sum + parseFloat(segment.monto_origen), 0)
  }
  const {error: expenseError} = await supabase
    .from('Gasto')
    .update({
      monto_total: totalAmount,
      fecha_gasto: expenseData.fecha_gasto,
      descripcion: expenseData.descripcion || '',
      tipo: type,
      id_categoria: expenseData.id_categoria_gasto || null,
      id_proveedor: supplierId,
      moneda: firstSegment?.moneda || expenseData.moneda || 'USD',
      tipo_cambio: firstSegment ? parseFloat(firstSegment.tipo_cambio) : (expenseData.tipo_cambio || 1),
      monto_moneda_origen: originAmountSum,
      es_gasto_internacional: isInternational,
      base_imponible: retentions.base_imponible,
      retencion_rc_iva: retentions.retencion_rc_iva,
      retencion_iue: retentions.retencion_iue,
      retencion_it: retentions.retencion_it,
      importe_costo: retentions.importe_costo,
      tiene_alcohol: hasAlcohol,
    })
    .eq('id_gasto', expenseId)
  if (expenseError) {
    return {error: expenseError.message, status: 500}
  }
  if (isInternational) {
    await supabase.from('Gasto_Tramo_Moneda').delete().eq('id_gasto', expenseId)
    if (usesSegments) {
      const segmentRows = expenseData.tramos.map((segment) => ({
        id_gasto: parseInt(expenseId),
        moneda: segment.moneda.trim().toUpperCase(),
        monto_origen: parseFloat(segment.monto_origen),
        tipo_cambio: parseFloat(segment.tipo_cambio),
        monto_usd: parseFloat((parseFloat(segment.monto_origen) / parseFloat(segment.tipo_cambio)).toFixed(2)),
      }))
      await supabase.from('Gasto_Tramo_Moneda').insert(segmentRows)
    }
  }
  await supabase.from('Gasto_Subitem').delete().eq('id_gasto', expenseId)
  if (usesSubItems) {
    const subItemRows = expenseData.subitems
      .filter((item) => item.descripcion?.trim() && parseFloat(item.monto) > 0)
      .map((item) => ({
        id_gasto: parseInt(expenseId),
        descripcion: item.descripcion.trim(),
        monto: parseFloat(item.monto),
      }))
    if (subItemRows.length > 0) {
      await supabase.from('Gasto_Subitem').insert(subItemRows)
    }
  }
  if (!expenseData.mantener_imagen) {
    await supabase.from('Imagen').delete().eq('id_gasto', expenseId)
    if (file) {
      const fileExtension = file.originalname.split('.').pop()
      const fileName = `gastos/${expenseId}_${Date.now()}.${fileExtension}`
      const {error: storageError} = await supabase.storage.from('facturas').upload(fileName, file.buffer, {contentType: file.mimetype})
      if (!storageError) {
        const {data: urlData} = supabase.storage.from('facturas').getPublicUrl(fileName)
        await supabase.from('Imagen').insert({url_archivo: urlData.publicUrl, id_gasto: expenseId})
      }
    }
  }
  const {data: updatedExpense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).single()
  if (updatedExpense?.id_viaje) {
    alcoholDetectionService.updateAlcoholInTrip(updatedExpense.id_viaje).catch((error) => console.warn('Error alcohol:', error.message))
  }
  return {}
};

// Elimina un gasto y todos sus registros relacionados
const deleteExpense = async (expenseId) => {
  const {data: expense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).single()
  if (!expense) {
    return {error: 'Gasto no encontrado', status: 404}
  }
  const tripId = expense.id_viaje
  const {data: invoices} = await supabase.from('Factura').select('id_factura').eq('id_gasto', expenseId)
  if (invoices && invoices.length > 0) {
    const invoiceIds = invoices.map((invoice) => invoice.id_factura)
    await supabase.from('Detalle_Factura').delete().in('id_factura', invoiceIds)
    await supabase.from('Factura_Impuestos').delete().in('id_factura', invoiceIds)
    await supabase.from('Factura').delete().in('id_factura', invoiceIds)
  }
  await supabase.from('Imagen').delete().eq('id_gasto', expenseId)
  const {error: deleteError} = await supabase.from('Gasto').delete().eq('id_gasto', expenseId)
  if (deleteError) {
    return {error: deleteError.message, status: 500}
  }
  alcoholDetectionService.updateAlcoholInTrip(tripId).catch((error) => console.warn('Error alcohol al eliminar:', error.message))
  return {}
};

module.exports = {calculateRetentions, calculateAmountFromSubitems, createExpense, updateExpense, deleteExpense};