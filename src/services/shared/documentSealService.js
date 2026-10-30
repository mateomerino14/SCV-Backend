const crypto = require('crypto');
const QRCode = require('qrcode');
const supabase = require('../../config/supabase');
const signatureService = require('./signatureService');
const {buildTripCode} = require('../../utils/tripCode');
const {escapeHtml} = require('../../utils/htmlEscape');

// Sin letras ni numeros que se confunden al leerlos (0, O, 1, I, L)
const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codeLength = 12;
const documentTypes = {
  memo: 'MEMORANDUM',
  statement: 'PLANILLA_RENDICION',
  receipt: 'RECIBO',
  fund: 'CONFIRMACION_FONDO',
  finalReview: 'RENDICION_FINAL',
};
const documentLabels = {
  MEMORANDUM: 'Memorándum de autorización de viaje',
  PLANILLA_RENDICION: 'Planilla de rendición de cuentas',
  RECIBO: 'Recibo',
  CONFIRMACION_FONDO: 'Confirmación de fondo',
  RENDICION_FINAL: 'Resultado de la rendición',
};
// Firmas que se muestran al verificar cada documento
const documentSignatureStages = {
  MEMORANDUM: ['MEMORANDUM'],
  PLANILLA_RENDICION: ['PREPARADO', 'JEFE', 'GERENTE'],
  RENDICION_FINAL: ['PREPARADO', 'JEFE', 'GERENTE'],
};
const signatureStageLabels = {MEMORANDUM: 'Autorizó el viaje', PREPARADO: 'Preparó la rendición', JEFE: 'Vo/ Bo Jefe de Área', GERENTE: 'Vo/ Bo Gerente de Área'};

// Genera un codigo aleatorio de 12 caracteres
const generateCode = () => Array.from(crypto.randomBytes(codeLength), (byte) => codeAlphabet[byte % codeAlphabet.length]).join('');

// Muestra el codigo en grupos de cuatro para leerlo facil
const formatCode = (code) => code.match(/.{1,4}/g).join('-');

// Direccion publica donde se verifica el documento
const verifyUrlOf = (code) => `${(process.env.FRONTEND_URL || 'https://scv-frontend.vercel.app').replace(/\/$/, '')}/verificar/${code}`;

// Registra el documento emitido con sus datos clave y devuelve su codigo, enlace y QR; si falla, el PDF sale sin sello
const createSeal = async ({type, tripId = null, expenseId = null, summary = {}}) => {
  try {
    const code = generateCode();
    const {error} = await supabase.from('Documento_Emitido').insert({codigo: code, tipo: type, id_viaje: tripId, id_gasto: expenseId, resumen: summary});
    if (error) {
      console.warn('[Sello] No se pudo registrar el documento:', error.message);
      return null;
    }
    const verifyUrl = verifyUrlOf(code);
    const qrDataUri = await QRCode.toDataURL(verifyUrl, {margin: 0, width: 160, errorCorrectionLevel: 'M'});
    return {code, verifyUrl, qrDataUri};
  }
  catch (error) {
    console.warn('[Sello] No se pudo generar el sello:', error.message);
    return null;
  }
};

// Bloque del sello para el pie de los PDF: el QR y el codigo para verificar el documento
const sealHtml = (seal) => {
  if (!seal) {
    return '';
  }
  return `<div class="sello">
    <img src="${seal.qrDataUri}" alt="QR de verificación">
    <div class="sello-texto">
      <strong>Documento verificable</strong><br>
      Código: <strong>${formatCode(seal.code)}</strong><br>
      Escanea el QR o entra a ${escapeHtml(seal.verifyUrl)} para comprobar que es auténtico.
    </div>
  </div>`;
};

// Estilos del sello, comunes a los PDF
const sealStyles = `
  .sello { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 4px; page-break-inside: avoid; }
  .sello img { width: 58px; height: 58px; }
  .sello-texto { font-size: 7pt; color: #404040; line-height: 1.4; word-break: break-all; }
`;

// Agrega el sello al final de un documento HTML ya armado
const withSeal = (html, seal) => {
  if (!seal) {
    return html;
  }
  return html.replace('</body>', `<style>${sealStyles}</style><div style="padding: 0 10px 10px;">${sealHtml(seal)}</div></body>`);
};

// Datos publicos de un documento emitido, para la pagina de verificacion
const verifyDocument = async (rawCode) => {
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== codeLength) {
    return {error: 'El código no es válido', status: 400};
  }
  const {data: document} = await supabase
    .from('Documento_Emitido')
    .select('codigo, tipo, resumen, fecha, id_viaje, Viaje(id_viaje, numero_viaje, anio_viaje, fecha_inicio, motivo, destino, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, apellido_materno))')
    .eq('codigo', code)
    .maybeSingle();
  if (!document) {
    return {error: 'No existe un documento con ese código: puede ser falso o estar mal escrito', status: 404};
  }
  let signatures = [];
  const stages = documentSignatureStages[document.tipo] || [];
  if (document.id_viaje && stages.length > 0) {
    const latest = await signatureService.getTripSignatures(document.id_viaje, document.fecha);
    signatures = stages.filter((stage) => latest[stage]).map((stage) => ({
      etapa: signatureStageLabels[stage],
      nombre: signatureService.signerNameOf(latest[stage]),
      cargo: latest[stage].Usuario?.Cargo?.nombre || '',
      fecha: latest[stage].fecha,
      automatica: latest[stage].automatica,
    }));
  }
  const trip = document.Viaje;
  return {
    document: {
      codigo: formatCode(document.codigo),
      tipo: documentLabels[document.tipo] || document.tipo,
      emitido: document.fecha,
      viaje: trip ? {codigo: buildTripCode(trip), motivo: trip.motivo, destino: trip.destino, empleado: signatureService.signerNameOf({Usuario: trip.Usuario})} : null,
      resumen: document.resumen,
      firmas: signatures,
    },
  };
};

module.exports = {documentTypes, createSeal, sealHtml, sealStyles, withSeal, verifyDocument, formatCode};
