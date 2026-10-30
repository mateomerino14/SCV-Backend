jest.mock('../../src/config/supabase', () => ({
  from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data: {activo: true, dias: [1, 2, 3, 4, 5], horas: ['08:00', '12:00']}, error: null})})})}),
}));
jest.mock('node-cron', () => ({schedule: jest.fn(() => ({stop: jest.fn()}))}));
jest.mock('../../src/services/shared/dailyDigestService', () => ({sendDailyDigest: jest.fn()}));
const cron = require('node-cron');
const reminderScheduleService = require('../../src/services/shared/reminderScheduleService');

// Acepta una configuracion valida de dias y horas
test('acepta dias y horas validos', () => {
  const result = reminderScheduleService.validateSchedule({activo: true, dias: [1, 2, 3, 4, 5], horas: ['08:00', '16:30']});
  expect(result).toBeNull();
});

// Exige al menos un dia cuando los recordatorios estan activos
test('rechaza recordatorios activos sin dias', () => {
  const result = reminderScheduleService.validateSchedule({activo: true, dias: [], horas: ['08:00']});
  expect(result).toBe('Elige al menos un día de la semana');
});

// Rechaza horas con formato invalido
test('rechaza una hora invalida', () => {
  const result = reminderScheduleService.validateSchedule({activo: true, dias: [1], horas: ['24:00']});
  expect(result).toBe('Las horas deben tener el formato HH:MM');
});

// Limita la cantidad de envios por dia
test('rechaza mas de cuatro horas por dia', () => {
  const result = reminderScheduleService.validateSchedule({activo: true, dias: [1], horas: ['08:00', '09:00', '10:00', '11:00', '12:00']});
  expect(result).toBe(`Puedes programar como máximo ${reminderScheduleService.maxTimes} envíos por día`);
});

// Permite guardar los recordatorios desactivados sin dias ni horas
test('acepta recordatorios desactivados', () => {
  const result = reminderScheduleService.validateSchedule({activo: false, dias: [], horas: []});
  expect(result).toBeNull();
});

// Sin la variable REMINDERS_ENABLED el servidor programa los recordatorios
test('programa los recordatorios por defecto', async () => {
  delete process.env.REMINDERS_ENABLED;
  cron.schedule.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  await reminderScheduleService.startScheduler();
  expect(reminderScheduleService.isEnabledOnThisServer()).toBe(true);
  expect(cron.schedule).toHaveBeenCalledTimes(2);
});

// Con REMINDERS_ENABLED=false el servidor no programa ningun envio, para no duplicar los correos de otro servidor
test('no programa recordatorios con REMINDERS_ENABLED=false', async () => {
  process.env.REMINDERS_ENABLED = 'false';
  cron.schedule.mockClear();
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  await reminderScheduleService.startScheduler();
  expect(reminderScheduleService.isEnabledOnThisServer()).toBe(false);
  expect(cron.schedule).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith('Recordatorios de pendientes: desactivados en este servidor (REMINDERS_ENABLED=false)');
  delete process.env.REMINDERS_ENABLED;
});
