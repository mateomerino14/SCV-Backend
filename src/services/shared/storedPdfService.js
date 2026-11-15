const crypto = require('crypto');
const supabase = require('../../config/supabase');
const pdfService = require('./pdfService');
const documentSealService = require('./documentSealService');

// Bucket privado: los PDF guardados solo los descarga el backend, que revisa los permisos de cada pedido
const bucket = 'documentos';

// Huella de los datos que aparecen en el documento: si cambia cualquiera de ellos, cambia la huella
const fingerprintOf = (data) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

// Busca el PDF ya guardado del mismo documento con los mismos datos y lo descarga; null si no hay o no se pudo leer
const findStoredPdf = async ({type, tripId, expenseId = null, fingerprint}) => {
  let query = supabase.from('Documento_Emitido').select('codigo, ruta_archivo')
    .eq('tipo', type).eq('id_viaje', tripId).eq('huella', fingerprint).not('ruta_archivo', 'is', null);
  if (expenseId) {
    query = query.eq('id_gasto', expenseId);
  }
  else {
    query = query.is('id_gasto', null);
  }
  const {data: rows, error} = await query.order('fecha', {ascending: false}).limit(1);
  if (error || !rows || rows.length === 0) {
    return null;
  }
  const {data: file, error: downloadError} = await supabase.storage.from(bucket).download(rows[0].ruta_archivo);
  if (downloadError || !file) {
    return null;
  }
  return Buffer.from(await file.arrayBuffer());
};

// Genera el PDF con un sello nuevo, lo guarda en el bucket y anota la ruta; si no se puede guardar, igual lo entrega
const createStoredPdf = async ({type, tripId, expenseId = null, fingerprint, summary, buildHtml, pdfOptions}) => {
  const seal = await documentSealService.createSeal({type, tripId, expenseId, summary, fingerprint});
  const buffer = await pdfService.generatePdf(buildHtml(seal), pdfOptions);
  if (!seal) {
    return buffer;
  }
  const path = `${type.toLowerCase()}/${seal.code}.pdf`;
  const {error: uploadError} = await supabase.storage.from(bucket).upload(path, buffer, {contentType: 'application/pdf', upsert: true});
  if (uploadError) {
    console.warn('[PDF guardado] No se pudo guardar el PDF:', uploadError.message);
    return buffer;
  }
  const {error: updateError} = await supabase.from('Documento_Emitido').update({ruta_archivo: path}).eq('codigo', seal.code);
  if (updateError) {
    console.warn('[PDF guardado] No se pudo anotar la ruta del PDF:', updateError.message);
  }
  return buffer;
};

// Entrega el PDF guardado si los datos del documento no cambiaron; si cambiaron o no existe, lo genera, lo guarda y lo entrega
const getOrCreatePdf = async (options) => {
  const fingerprint = fingerprintOf(options.data);
  const stored = await findStoredPdf({...options, fingerprint});
  if (stored) {
    return stored;
  }
  return createStoredPdf({...options, fingerprint});
};

module.exports = {bucket, getOrCreatePdf};
