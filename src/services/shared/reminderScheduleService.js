const cron = require('node-cron');
const supabase = require('../../config/supabase');
const dailyDigestService = require('./dailyDigestService');

const timezone = 'America/La_Paz';
const maxTimes = 4;
// 0 = domingo ... 6 = sabado, como en cron
const validDays = [0, 1, 2, 3, 4, 5, 6];
const defaultSchedule = {activo: true, dias: [1, 2, 3, 4, 5], horas: ['08:00', '12:00', '16:00']};

let scheduledTasks = [];
let sendingNow = false;

// Ordena y limpia los dias y horas para guardarlos siempre igual
const normalizeSchedule = (schedule) => ({
  activo: schedule.activo !== false,
  dias: [...new Set((schedule.dias || []).map(Number))].filter((day) => validDays.includes(day)).sort((a, b) => a - b),
  horas: [...new Set(schedule.horas || [])].sort(),
});

// Obtiene la configuracion guardada; si la tabla aun no tiene la fila, usa la de fabrica
const getSchedule = async () => {
  const {data, error} = await supabase
    .from('Configuracion_Recordatorio')
    .select('activo, dias, horas, fecha_actualizacion, Usuario(nombre, apellido_paterno)')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) {
    return {...defaultSchedule, porDefecto: true};
  }
  const schedule = normalizeSchedule(data);
  let actualizadoPor = null;
  if (data.Usuario) {
    actualizadoPor = `${data.Usuario.nombre} ${data.Usuario.apellido_paterno}`;
  }
  return {...schedule, fecha_actualizacion: data.fecha_actualizacion, actualizado_por: actualizadoPor};
};

// Valida los dias y horas enviados por el administrador
const validateSchedule = (schedule) => {
  if (typeof schedule.activo !== 'boolean') {
    return 'Indica si los recordatorios están activos';
  }
  if (!Array.isArray(schedule.dias) || !Array.isArray(schedule.horas)) {
    return 'Los días y las horas son requeridos';
  }
  if (schedule.dias.some((day) => !validDays.includes(Number(day)))) {
    return 'Hay un día de la semana no válido';
  }
  if (schedule.horas.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time)))) {
    return 'Las horas deben tener el formato HH:MM';
  }
  const normalized = normalizeSchedule(schedule);
  if (normalized.horas.length > maxTimes) {
    return `Puedes programar como máximo ${maxTimes} envíos por día`;
  }
  if (normalized.activo && normalized.dias.length === 0) {
    return 'Elige al menos un día de la semana';
  }
  if (normalized.activo && normalized.horas.length === 0) {
    return 'Agrega al menos una hora de envío';
  }
  return null;
};

// Detiene los envios programados y crea uno por cada hora configurada
const applySchedule = (schedule) => {
  scheduledTasks.forEach((task) => {
    task.stop();
    if (typeof task.destroy === 'function') {
      task.destroy();
    }
  });
  scheduledTasks = [];
  if (!schedule.activo || schedule.dias.length === 0) {
    return;
  }
  const days = schedule.dias.join(',');
  schedule.horas.forEach((time) => {
    const [hour, minute] = time.split(':').map(Number);
    const task = cron.schedule(`${minute} ${hour} * * ${days}`, () => {
      dailyDigestService.sendDailyDigest();
    }, {timezone});
    scheduledTasks.push(task);
  });
};

// Programa los envios al arrancar el servidor con la configuracion guardada
const startScheduler = async () => {
  const schedule = await getSchedule();
  applySchedule(schedule);
  let description = 'desactivados';
  if (schedule.activo) {
    description = `días ${schedule.dias.join(',')} a las ${schedule.horas.join(', ')} (hora Bolivia)`;
  }
  console.log(`Recordatorios de pendientes: ${description}`);
};

// Guarda la configuracion y reprograma los envios sin reiniciar el servidor
const updateSchedule = async (schedule, adminId) => {
  const validationError = validateSchedule(schedule);
  if (validationError) {
    return {error: validationError, status: 400};
  }
  const normalized = normalizeSchedule(schedule);
  const {error} = await supabase
    .from('Configuracion_Recordatorio')
    .upsert({id: 1, ...normalized, id_usuario_actualizacion: adminId, fecha_actualizacion: new Date().toISOString()});
  if (error) {
    return {error: 'No se pudo guardar la configuración de recordatorios', status: 500};
  }
  applySchedule(normalized);
  return {message: 'Configuración de recordatorios guardada', configuracion: await getSchedule()};
};

// Envia el resumen en el momento (o solo lo simula con dryRun); evita dos envios a la vez
const sendNow = async ({dryRun = false} = {}) => {
  if (!dryRun && sendingNow) {
    return {error: 'Ya se está enviando un resumen, espera unos segundos', status: 409};
  }
  if (!dryRun) {
    sendingNow = true;
  }
  try {
    const result = await dailyDigestService.sendDailyDigest({dryRun});
    if (result.error) {
      return {error: result.error, status: 500};
    }
    const mensajes = result.mensajes;
    return {
      mensajes,
      total: mensajes.length,
      enviados: mensajes.filter((message) => message.enviado).length,
      fallidos: mensajes.filter((message) => message.error).length,
    };
  }
  finally {
    if (!dryRun) {
      sendingNow = false;
    }
  }
};

module.exports = {getSchedule, updateSchedule, startScheduler, sendNow, validateSchedule, maxTimes};
