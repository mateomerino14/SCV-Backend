const supabase = require('../../config/supabase');
const deadlineService = require('../shared/deadlineService');
const alcoholDetectionService = require('../shared/alcoholDetectionService');
const supplierService = require('./supplierService');
const substitutionService = require('../approval/substitutionService');
const {calculateRetentions} = require('../../utils/retentions');
const storageService = require('../shared/storageService');

const maxBackupImages = 2;
const maxReceiptNumber = 50;

// Numero impreso del recibo en papel, o null si el empleado no lo escribio
const getReceiptNumber = (expenseData) => String(expenseData.numero_recibo || '').trim() || null;

// Junta la descripcion y los subitems para buscar bebidas alcoholicas
const buildAlcoholText = (expenseData, usesSubItems) => {
  const texts = [expenseData.descripcion];
  if (usesSubItems) {
    texts.push(...expenseData.subitems.map((item) => item.descripcion));
  }
  return texts.join(' ');
};

// Moneda real del gasto: BOB si es nacional; en internacionales, la del primer tramo
const getExpenseCurrency = (expenseData, isInternational, firstSegment) => {
  let currency = 'BOB';
  if (isInternational) {
    currency = String(firstSegment?.moneda || expenseData.moneda || 'USD').trim().toUpperCase();
  }
  let exchangeRate = expenseData.tipo_cambio || 1;
  if (firstSegment) {
    exchangeRate = parseFloat(firstSegment.tipo_cambio);
  }
  return {moneda: currency, tipo_cambio: exchangeRate};
};

// Calcula el monto total a partir de un arreglo de subitems
const calculateAmountFromSubitems = (subItems) => {
  if (!Array.isArray(subItems) || subItems.length === 0) {
    return null;
  }
  return parseFloat(subItems.reduce((sum, item) => sum + parseFloat(item.monto || 0), 0).toFixed(2));
};

// Valida tramos de moneda y subgastos antes de escribir nada
const validateExpenseDetails = (expenseData, isInternational) => {
  if (isInternational && Array.isArray(expenseData.tramos)) {
    for (const segment of expenseData.tramos) {
      if (!segment?.moneda || !String(segment.moneda).trim() || String(segment.moneda).trim().length > 10) {
        return 'Cada conversión de moneda debe indicar la moneda de origen';
      }
      if (!(parseFloat(segment.monto_origen) > 0) || !(parseFloat(segment.tipo_cambio) > 0)) {
        return 'Cada conversión de moneda debe tener un monto y un tipo de cambio mayores a cero';
      }
    }
  }
  if (String(expenseData.numero_recibo || '').trim().length > maxReceiptNumber) {
    return `El número de recibo admite como máximo ${maxReceiptNumber} caracteres`;
  }
  if (Array.isArray(expenseData.subitems)) {
    for (const item of expenseData.subitems) {
      if (!item?.descripcion?.trim() || !(parseFloat(item.monto) > 0)) {
        return 'Cada subgasto debe tener una descripción y un monto mayor a cero';
      }
    }
  }
  return null;
};

// Sube el comprobante antes de escribir el gasto y devuelve su URL publica
const uploadReceiptImage = async (file) => {
  const upload = await storageService.uploadFile('gastos', file);
  if (upload.error) {
    return {error: 'No se pudo subir el comprobante. Intenta nuevamente.'};
  }
  return upload;
};

// Sube los respaldos extra (por ejemplo, el comprobante del cambio de moneda) y devuelve sus URLs
const uploadBackupImages = async (files) => {
  const urls = [];
  for (const file of files) {
    const upload = await uploadReceiptImage(file);
    if (upload.error) {
      await storageService.removeFiles(urls);
      return {error: upload.error};
    }
    urls.push(upload.url);
  }
  return {urls};
};

// Guarda las URLs de los respaldos de un gasto
const insertBackupImages = async (expenseId, urls) => {
  if (urls.length === 0) {
    return {};
  }
  const {error} = await supabase.from('Imagen_Respaldo').insert(urls.map((url) => ({url_archivo: url, id_gasto: expenseId})));
  return {error};
};

// Crea un gasto nuevo, con sus tramos de moneda, subitems, comprobante y respaldos
const createExpense = async (expenseData, images, userId) => {
  const {receipt: file, backups} = images;
  if (!expenseData.id_viaje) {
    return {error: 'El viaje es requerido', status: 400};
  }
  const access = await substitutionService.canRegisterExpenseOnTrip(expenseData.id_viaje, userId);
  if (!access.allowed) {
    return {error: access.error, status: access.status};
  }
  const isInternational = expenseData.es_gasto_internacional === true || expenseData.es_gasto_internacional === 'true';
  const usesSegments = isInternational && Array.isArray(expenseData.tramos) && expenseData.tramos.length > 0;
  const usesSubItems = Array.isArray(expenseData.subitems) && expenseData.subitems.length > 0;
  const detailsError = validateExpenseDetails(expenseData, isInternational);
  if (detailsError) {
    return {error: detailsError, status: 400};
  }
  let totalAmount = parseFloat(expenseData.monto_total);
  if (usesSubItems) {
    const subItemsAmount = calculateAmountFromSubitems(expenseData.subitems);
    if (subItemsAmount !== null) {
      totalAmount = subItemsAmount;
    }
  }
  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    return {error: 'El monto es requerido y debe ser mayor a cero', status: 400};
  }
  if (expenseData.fecha_gasto) {
    const deadlineValidation = await deadlineService.validateTripDeadline(expenseData.id_viaje, expenseData.fecha_gasto);
    if (!deadlineValidation.valid) {
      return {error: deadlineValidation.error, status: 400, requiereAutorizacion: !!deadlineValidation.requiereAutorizacion};
    }
  }
  if (backups.length > maxBackupImages) {
    return {error: `Puedes adjuntar como máximo ${maxBackupImages} respaldos por gasto`, status: 400};
  }
  let imageUrl = null;
  if (file) {
    const upload = await uploadReceiptImage(file);
    if (upload.error) {
      return {error: upload.error, status: 500};
    }
    imageUrl = upload.url;
  }
  const backupUpload = await uploadBackupImages(backups);
  if (backupUpload.error) {
    await storageService.removeFiles([imageUrl]);
    return {error: backupUpload.error, status: 500};
  }
  // Si algo falla al guardar, se borran los archivos recien subidos para no dejarlos sueltos
  const failWith = async (error) => {
    await storageService.removeFiles([imageUrl, ...backupUpload.urls]);
    return {error, status: 500};
  };
  const supplierId = await supplierService.findOrCreateSupplier(expenseData.proveedor);
  const type = expenseData.tipo || 'S';
  const alcoholText = buildAlcoholText(expenseData, usesSubItems);
  const hasAlcohol = await alcoholDetectionService.analyzeAlcoholText(alcoholText);
  const retentions = calculateRetentions(totalAmount, type, isInternational, hasAlcohol);
  let firstSegment = null;
  if (usesSegments) {
    firstSegment = expenseData.tramos[0];
  }
  let originAmountSum = expenseData.monto_moneda_origen || totalAmount;
  if (usesSegments) {
    originAmountSum = expenseData.tramos.reduce((sum, segment) => sum + parseFloat(segment.monto_origen), 0);
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
      ...getExpenseCurrency(expenseData, isInternational, firstSegment),
      monto_moneda_origen: originAmountSum,
      es_gasto_internacional: isInternational,
      base_imponible: retentions.base_imponible,
      retencion_rc_iva: retentions.retencion_rc_iva,
      retencion_iue: retentions.retencion_iue,
      retencion_it: retentions.retencion_it,
      importe_costo: retentions.importe_costo,
      tiene_alcohol: hasAlcohol,
      numero_recibo: getReceiptNumber(expenseData),
    })
    .select()
    .single();
  if (expenseError) {
    return failWith(expenseError.message);
  }
  if (usesSegments) {
    const segmentRows = expenseData.tramos.map((segment) => ({
      id_gasto: expense.id_gasto,
      moneda: segment.moneda.trim().toUpperCase(),
      monto_origen: parseFloat(segment.monto_origen),
      tipo_cambio: parseFloat(segment.tipo_cambio),
      monto_usd: parseFloat((parseFloat(segment.monto_origen) / parseFloat(segment.tipo_cambio)).toFixed(2)),
    }));
    const {error: segmentsError} = await supabase.from('Gasto_Tramo_Moneda').insert(segmentRows);
    if (segmentsError) {
      await supabase.from('Gasto').delete().eq('id_gasto', expense.id_gasto);
      return failWith(segmentsError.message);
    }
  }
  if (usesSubItems) {
    const subItemRows = expenseData.subitems
      .filter((item) => item.descripcion?.trim() && parseFloat(item.monto) > 0)
      .map((item) => ({
        id_gasto: expense.id_gasto,
        descripcion: item.descripcion.trim(),
        monto: parseFloat(item.monto),
      }));
    if (subItemRows.length > 0) {
      const {error: subItemsError} = await supabase.from('Gasto_Subitem').insert(subItemRows);
      if (subItemsError) {
        await supabase.from('Gasto').delete().eq('id_gasto', expense.id_gasto);
        return failWith(subItemsError.message);
      }
    }
  }
  if (imageUrl) {
    const {error: imageError} = await supabase.from('Imagen').insert({url_archivo: imageUrl, id_gasto: expense.id_gasto});
    if (imageError) {
      await supabase.from('Gasto').delete().eq('id_gasto', expense.id_gasto);
      return failWith(imageError.message);
    }
  }
  const {error: backupsError} = await insertBackupImages(expense.id_gasto, backupUpload.urls);
  if (backupsError) {
    await supabase.from('Gasto').delete().eq('id_gasto', expense.id_gasto);
    return failWith(backupsError.message);
  }
  // Se espera para que el viaje ya tenga tiene_alcohol actualizado si se finaliza enseguida
  await alcoholDetectionService.updateAlcoholInTrip(expenseData.id_viaje).catch((error) => console.warn('Error alcohol:', error.message));
  return {expense};
};

// Actualiza un gasto existente, reemplazando sus tramos de moneda, subitems, comprobante y respaldos
const updateExpense = async (expenseId, expenseData, images, userId) => {
  const {receipt: file, backups} = images;
  const {data: existingExpense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).single();
  if (!existingExpense) {
    return {error: 'Gasto no encontrado', status: 404};
  }
  const access = await substitutionService.canRegisterExpenseOnTrip(existingExpense.id_viaje, userId);
  if (!access.allowed) {
    return {error: access.error, status: access.status};
  }
  // Mismo control de plazo y fechas que al registrar, con el viaje real del gasto
  const deadlineValidation = await deadlineService.validateTripDeadline(existingExpense.id_viaje, expenseData.fecha_gasto);
  if (!deadlineValidation.valid) {
    return {error: deadlineValidation.error, status: 400, requiereAutorizacion: !!deadlineValidation.requiereAutorizacion};
  }
  const isInternational = expenseData.es_gasto_internacional === true || expenseData.es_gasto_internacional === 'true';
  const usesSegments = isInternational && Array.isArray(expenseData.tramos) && expenseData.tramos.length > 0;
  const usesSubItems = Array.isArray(expenseData.subitems) && expenseData.subitems.length > 0;
  const detailsError = validateExpenseDetails(expenseData, isInternational);
  if (detailsError) {
    return {error: detailsError, status: 400};
  }
  let totalAmount = parseFloat(expenseData.monto_total);
  if (usesSubItems) {
    const subItemsAmount = calculateAmountFromSubitems(expenseData.subitems);
    if (subItemsAmount !== null) {
      totalAmount = subItemsAmount;
    }
  }
  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    return {error: 'El monto es requerido y debe ser mayor a cero', status: 400};
  }
  const {data: existingBackups} = await supabase.from('Imagen_Respaldo').select('id_respaldo, url_archivo').eq('id_gasto', expenseId);
  let keptUrls = [];
  if (Array.isArray(expenseData.respaldos_conservados)) {
    keptUrls = expenseData.respaldos_conservados;
  }
  const removedBackups = (existingBackups || []).filter((backup) => !keptUrls.includes(backup.url_archivo));
  const removedBackupIds = removedBackups.map((backup) => backup.id_respaldo);
  const keptCount = (existingBackups || []).length - removedBackupIds.length;
  if (keptCount + backups.length > maxBackupImages) {
    return {error: `Puedes adjuntar como máximo ${maxBackupImages} respaldos por gasto`, status: 400};
  }
  const {data: currentImage} = await supabase.from('Imagen').select('url_archivo').eq('id_gasto', expenseId).maybeSingle();
  let newImageUrl = null;
  if (file && !expenseData.mantener_imagen) {
    const upload = await uploadReceiptImage(file);
    if (upload.error) {
      return {error: upload.error, status: 500};
    }
    newImageUrl = upload.url;
  }
  const backupUpload = await uploadBackupImages(backups);
  if (backupUpload.error) {
    await storageService.removeFiles([newImageUrl]);
    return {error: backupUpload.error, status: 500};
  }
  const supplierId = await supplierService.findOrCreateSupplier(expenseData.proveedor);
  const type = expenseData.tipo || 'S';
  const alcoholText = buildAlcoholText(expenseData, usesSubItems);
  const hasAlcohol = await alcoholDetectionService.analyzeAlcoholText(alcoholText);
  const retentions = calculateRetentions(totalAmount, type, isInternational, hasAlcohol);
  let firstSegment = null;
  if (usesSegments) {
    firstSegment = expenseData.tramos[0];
  }
  let originAmountSum = expenseData.monto_moneda_origen || totalAmount;
  if (usesSegments) {
    originAmountSum = expenseData.tramos.reduce((sum, segment) => sum + parseFloat(segment.monto_origen), 0);
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
      ...getExpenseCurrency(expenseData, isInternational, firstSegment),
      monto_moneda_origen: originAmountSum,
      es_gasto_internacional: isInternational,
      base_imponible: retentions.base_imponible,
      retencion_rc_iva: retentions.retencion_rc_iva,
      retencion_iue: retentions.retencion_iue,
      retencion_it: retentions.retencion_it,
      importe_costo: retentions.importe_costo,
      tiene_alcohol: hasAlcohol,
      numero_recibo: getReceiptNumber(expenseData),
    })
    .eq('id_gasto', expenseId);
  if (expenseError) {
    await storageService.removeFiles([newImageUrl, ...backupUpload.urls]);
    return {error: expenseError.message, status: 500};
  }
  const childError = 'El gasto se guardó, pero no se pudieron actualizar todos sus datos. Revísalo y vuelve a guardarlo.';
  // Se borran siempre: si el gasto paso de internacional a nacional no deben quedar tramos
  await supabase.from('Gasto_Tramo_Moneda').delete().eq('id_gasto', expenseId);
  {
    if (usesSegments) {
      const segmentRows = expenseData.tramos.map((segment) => ({
        id_gasto: parseInt(expenseId),
        moneda: segment.moneda.trim().toUpperCase(),
        monto_origen: parseFloat(segment.monto_origen),
        tipo_cambio: parseFloat(segment.tipo_cambio),
        monto_usd: parseFloat((parseFloat(segment.monto_origen) / parseFloat(segment.tipo_cambio)).toFixed(2)),
      }));
      const {error: segmentsError} = await supabase.from('Gasto_Tramo_Moneda').insert(segmentRows);
      if (segmentsError) {
        return {error: childError, status: 500};
      }
    }
  }
  await supabase.from('Gasto_Subitem').delete().eq('id_gasto', expenseId);
  if (usesSubItems) {
    const subItemRows = expenseData.subitems.map((item) => ({
      id_gasto: parseInt(expenseId),
      descripcion: item.descripcion.trim(),
      monto: parseFloat(item.monto),
    }));
    const {error: subItemsError} = await supabase.from('Gasto_Subitem').insert(subItemRows);
    if (subItemsError) {
      return {error: childError, status: 500};
    }
  }
  if (!expenseData.mantener_imagen) {
    // El comprobante nuevo ya se subio antes de modificar el gasto
    await supabase.from('Imagen').delete().eq('id_gasto', expenseId);
    if (newImageUrl) {
      const {error: imageError} = await supabase.from('Imagen').insert({url_archivo: newImageUrl, id_gasto: expenseId});
      if (imageError) {
        return {error: childError, status: 500};
      }
    }
  }
  if (removedBackupIds.length > 0) {
    await supabase.from('Imagen_Respaldo').delete().in('id_respaldo', removedBackupIds);
  }
  const {error: backupsError} = await insertBackupImages(parseInt(expenseId), backupUpload.urls);
  if (backupsError) {
    return {error: childError, status: 500};
  }
  // Los archivos reemplazados o quitados ya no los usa nadie
  const replacedFiles = removedBackups.map((backup) => backup.url_archivo);
  if (!expenseData.mantener_imagen && currentImage?.url_archivo) {
    replacedFiles.push(currentImage.url_archivo);
  }
  await storageService.removeFiles(replacedFiles);
  const {data: updatedExpense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).single();
  if (updatedExpense?.id_viaje) {
    await alcoholDetectionService.updateAlcoholInTrip(updatedExpense.id_viaje).catch((error) => console.warn('Error alcohol:', error.message));
  }
  return {};
};

// Elimina un gasto y todos sus registros relacionados
const deleteExpense = async (expenseId, userId) => {
  const {data: expense} = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', expenseId).single();
  if (!expense) {
    return {error: 'Gasto no encontrado', status: 404};
  }
  const tripId = expense.id_viaje;
  const access = await substitutionService.canRegisterExpenseOnTrip(tripId, userId);
  if (!access.allowed) {
    return {error: access.error, status: access.status};
  }
  const [{data: images}, {data: backups}] = await Promise.all([
    supabase.from('Imagen').select('url_archivo').eq('id_gasto', expenseId),
    supabase.from('Imagen_Respaldo').select('url_archivo').eq('id_gasto', expenseId),
  ]);
  const {data: invoices} = await supabase.from('Factura').select('id_factura').eq('id_gasto', expenseId);
  if (invoices && invoices.length > 0) {
    const invoiceIds = invoices.map((invoice) => invoice.id_factura);
    await supabase.from('Detalle_Factura').delete().in('id_factura', invoiceIds);
    await supabase.from('Factura_Impuestos').delete().in('id_factura', invoiceIds);
    await supabase.from('Factura').delete().in('id_factura', invoiceIds);
  }
  await supabase.from('Imagen').delete().eq('id_gasto', expenseId);
  await supabase.from('Imagen_Respaldo').delete().eq('id_gasto', expenseId);
  const {error: deleteError} = await supabase.from('Gasto').delete().eq('id_gasto', expenseId);
  if (deleteError) {
    return {error: deleteError.message, status: 500};
  }
  await storageService.removeFiles([...(images || []), ...(backups || [])].map((image) => image.url_archivo));
  await alcoholDetectionService.updateAlcoholInTrip(tripId).catch((error) => console.warn('Error alcohol al eliminar:', error.message));
  return {};
};

module.exports = {createExpense, updateExpense, deleteExpense};