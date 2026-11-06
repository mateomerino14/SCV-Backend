const supabase = require('../../config/supabase');

// Registra un evento de auditoria con su detalle opcional; si falla solo deja un aviso en el log
const logAudit = async (userId, tipo, detalle = null) => {
  if (!userId) {
    return;
  }
  try {
    await supabase.from('Auditoria').insert({fecha: new Date().toISOString(), tipo, id_usuario: userId, detalle});
  }
  catch (error) {
    console.warn('Error al registrar auditoria:', error.message);
  }
};

module.exports = {logAudit};
