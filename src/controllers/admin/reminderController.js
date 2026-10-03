const reminderScheduleService = require('../../services/shared/reminderScheduleService');

// Obtiene los dias y horas en que se envia el resumen de pendientes
const getSchedule = async (req, res) => {
  const schedule = await reminderScheduleService.getSchedule();
  return res.json(schedule);
};

// Guarda los dias y horas del resumen de pendientes y los aplica en el momento
const updateSchedule = async (req, res) => {
  const {activo, dias, horas} = req.body || {};
  const result = await reminderScheduleService.updateSchedule({activo, dias, horas}, req.user.id_usuario);
  if (result.error) {
    return res.status(result.status || 500).json({error: result.error});
  }
  else {
    return res.json(result);
  }
};

// Muestra a quien le llegaria el resumen y que diria, sin enviar nada
const previewDigest = async (req, res) => {
  const result = await reminderScheduleService.sendNow({dryRun: true});
  if (result.error) {
    return res.status(result.status || 500).json({error: result.error});
  }
  else {
    return res.json(result);
  }
};

// Envia el resumen de pendientes en el momento
const sendDigestNow = async (req, res) => {
  const result = await reminderScheduleService.sendNow();
  if (result.error) {
    return res.status(result.status || 500).json({error: result.error});
  }
  else {
    return res.json(result);
  }
};

module.exports = {getSchedule, updateSchedule, previewDigest, sendDigestNow};
