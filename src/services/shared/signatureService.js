const bcrypt = require('bcrypt');
const supabase = require('../../config/supabase');
const {escapeHtml} = require('../../utils/htmlEscape');

const pngPrefix = 'data:image/png;base64,';
const maxSignatureLength = 400000;
const minSignatureBytes = 300;
const signatureStages = {memo: 'MEMORANDUM', prepared: 'PREPARADO', boss: 'JEFE', manager: 'GERENTE', reviewer: 'REVISOR'};
const missingSignatureMessage = 'Firma en el recuadro antes de continuar';
const missingStoredSignatureMessage = 'Registra tu firma digital en tu perfil antes de firmar';
const wrongPasswordMessage = 'La contraseña no es correcta';

// Valida que la firma sea un PNG dibujado con trazos (no vacio ni demasiado grande); devuelve el error o null
const validateSignature = (image) => {
  if (typeof image !== 'string' || !image.startsWith(pngPrefix)) {
    return missingSignatureMessage;
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(image.slice(pngPrefix.length))) {
    return missingSignatureMessage;
  }
  if (image.length > maxSignatureLength) {
    return 'La firma es demasiado grande; vuelve a firmar';
  }
  const bytes = Buffer.from(image.slice(pngPrefix.length), 'base64');
  if (bytes.length < minSignatureBytes || bytes.toString('ascii', 1, 4) !== 'PNG') {
    return missingSignatureMessage;
  }
  return null;
};

// Intentos fallidos de contrasena al firmar, por usuario, para que una sesion abierta no sirva para adivinarla
const failedAttempts = new Map();
const maxFailedAttempts = 10;
const attemptsWindowMs = 15 * 60 * 1000;
const tooManyAttemptsMessage = 'Demasiados intentos con una contraseña incorrecta. Espera 15 minutos antes de volver a firmar.';

// Intentos fallidos del usuario que siguen dentro de la ventana de tiempo
const recentFailuresOf = (userId) => {
  const now = Date.now();
  const recent = (failedAttempts.get(userId) || []).filter((time) => now - time < attemptsWindowMs);
  failedAttempts.set(userId, recent);
  return recent;
};

// Confirma la contrasena contando los intentos fallidos; devuelve el error o null si es correcta
const confirmPassword = async (userId, password) => {
  if (recentFailuresOf(userId).length >= maxFailedAttempts) {
    return {error: tooManyAttemptsMessage, status: 429};
  }
  if (!(await isPasswordOf(userId, password))) {
    recentFailuresOf(userId).push(Date.now());
    return {error: wrongPasswordMessage, status: 400};
  }
  failedAttempts.delete(userId);
  return null;
};

// Revisa la contrasena del usuario, que confirma que es el quien firma
const isPasswordOf = async (userId, password) => {
  if (typeof password !== 'string' || password === '') {
    return false;
  }
  const {data} = await supabase.from('Usuario').select('contrasenia').eq('id_usuario', userId).maybeSingle();
  if (!data?.contrasenia) {
    return false;
  }
  return bcrypt.compare(password, data.contrasenia);
};

// Firma digital que el usuario registro en su perfil, o null si aun no tiene
const getUserSignature = async (userId) => {
  const {data} = await supabase.from('Firma_Usuario').select('imagen, fecha_actualizacion').eq('id_usuario', userId).maybeSingle();
  return data || null;
};

// Registra o cambia la firma digital del usuario; pide su contrasena para que nadie mas la cambie
const saveUserSignature = async (userId, image, password) => {
  const signatureError = validateSignature(image);
  if (signatureError) {
    return {error: signatureError, status: 400};
  }
  const passwordError = await confirmPassword(userId, password);
  if (passwordError) {
    return passwordError;
  }
  const {data, error} = await supabase
    .from('Firma_Usuario')
    .upsert({id_usuario: userId, imagen: image, fecha_actualizacion: new Date().toISOString()})
    .select('imagen, fecha_actualizacion')
    .single();
  if (error) {
    return {error: error.message, status: 500};
  }
  return {signature: data};
};

// Firma guardada con la que el usuario firma un documento, confirmada con su contrasena
const signatureForSigning = async (userId, password) => {
  const stored = await getUserSignature(userId);
  if (!stored) {
    return {error: missingStoredSignatureMessage, status: 400};
  }
  const passwordError = await confirmPassword(userId, password);
  if (passwordError) {
    return passwordError;
  }
  return {image: stored.imagen};
};

// Guarda la firma de una etapa del viaje; las automaticas no llevan trazo
const saveSignature = async (tripId, stage, userId, {image = null, automatic = false, ip = null} = {}) => {
  const {error} = await supabase.from('Firma').insert({id_viaje: tripId, etapa: stage, id_usuario: userId, imagen: image, automatica: automatic, ip});
  if (error) {
    console.warn(`[Firma] No se pudo guardar la firma ${stage} del viaje ${tripId}:`, error.message);
  }
};

// Ultima firma de cada etapa del viaje (hasta una fecha, si se indica), con el nombre y cargo de quien firmo
const getTripSignatures = async (tripId, until = null) => {
  let query = supabase
    .from('Firma')
    .select('etapa, imagen, automatica, fecha, id_usuario, Usuario(nombre, apellido_paterno, apellido_materno, Cargo(nombre), Rol(nombre))')
    .eq('id_viaje', tripId);
  if (until) {
    query = query.lte('fecha', until);
  }
  const {data} = await query.order('fecha', {ascending: false});
  const latest = {};
  (data || []).forEach((signature) => {
    if (!latest[signature.etapa]) {
      latest[signature.etapa] = signature;
    }
  });
  return latest;
};

// Quien envio la ultima vez la rendicion (firmo Preparado por) y si fue un reemplazo y no el titular
const submitterOf = async (tripId, ownerId) => {
  const {data} = await supabase
    .from('Firma')
    .select('id_usuario, fecha, Usuario(nombre, apellido_paterno)')
    .eq('id_viaje', tripId)
    .eq('etapa', signatureStages.prepared)
    .order('fecha', {ascending: false})
    .limit(1);
  const latest = (data || [])[0];
  if (!latest) {
    return null;
  }
  return {nombre: latest.Usuario?.nombre, apellido_paterno: latest.Usuario?.apellido_paterno, fecha: latest.fecha, esReemplazo: latest.id_usuario !== ownerId};
};

// Firmas de los tres casilleros de la planilla: Preparado por, Aprobado por (jefe directo) y Revisado/Registrado por (revisor)
const getStatementSignatures = async (tripId, until = null) => {
  const latest = await getTripSignatures(tripId, until);
  return {prepared: latest[signatureStages.prepared] || null, boss: latest[signatureStages.boss] || null, reviewer: latest[signatureStages.reviewer] || null};
};

// Firmas de la planilla listas para el Excel: trazo, nombre, cargo y fecha de cada casillero
const statementSignaturesForExport = async (tripId) => {
  const signatures = await getStatementSignatures(tripId);
  const toExport = (signature) => {
    if (!signature) {
      return null;
    }
    return {imagen: signature.imagen, automatica: signature.automatica, nombre: signerNameOf(signature), cargo: signature.Usuario?.Cargo?.nombre || '', fecha: signatureDateOf(signature)};
  };
  return {preparado: toExport(signatures.prepared), jefe: toExport(signatures.boss), revisor: toExport(signatures.reviewer)};
};

// Nombre completo de quien firmo
const signerNameOf = (signature) => [signature?.Usuario?.nombre, signature?.Usuario?.apellido_paterno, signature?.Usuario?.apellido_materno].filter(Boolean).join(' ');

// Fecha y hora de Bolivia de una firma
const signatureDateOf = (signature) => new Date(signature.fecha).toLocaleString('es-BO', {timeZone: 'America/La_Paz', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});

// Casillero de firma para los PDF: el trazo, la linea, el titulo, el nombre y cargo, y cuando se firmo
const signatureBlockHtml = (signature, title, fallbackRole) => {
  let stroke = '<div class="firma-espacio"></div>';
  let detail = `<div class="firma-rol">${escapeHtml(fallbackRole)}</div>`;
  if (signature) {
    const name = escapeHtml(signerNameOf(signature));
    const role = escapeHtml(signature.Usuario?.Cargo?.nombre || fallbackRole);
    if (signature.automatica) {
      stroke = '<div class="firma-espacio firma-auto">Aprobación automática</div>';
    }
    else {
      stroke = `<img class="firma-trazo" src="${signature.imagen}" alt="Firma">`;
    }
    detail = `<div class="firma-nombre">${name}</div><div class="firma-rol">${role}</div><div class="firma-fecha">Firmado electrónicamente el ${signatureDateOf(signature)}</div>`;
  }
  return `<div class="firma-bloque">${stroke}<div class="firma-linea">${escapeHtml(title)}</div>${detail}</div>`;
};

// Estilos de los casilleros de firma, comunes a los PDF
const signatureStyles = `
  .firma-bloque { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; }
  .firma-trazo { height: 46px; max-width: 160px; object-fit: contain; }
  .firma-espacio { height: 46px; display: flex; align-items: flex-end; justify-content: center; }
  .firma-auto { font-size: 7pt; font-style: italic; color: #595959; }
  .firma-linea { width: 85%; border-top: 1px solid #000; padding-top: 3px; font-size: 7.5pt; font-weight: bold; }
  .firma-nombre { font-size: 7.5pt; }
  .firma-rol { font-size: 7pt; }
  .firma-fecha { font-size: 6pt; color: #7f7f7f; }
`;

module.exports = {signatureStages, validateSignature, getUserSignature, saveUserSignature, signatureForSigning, saveSignature, getTripSignatures, submitterOf, getStatementSignatures, statementSignaturesForExport, signerNameOf, signatureDateOf, signatureBlockHtml, signatureStyles};
