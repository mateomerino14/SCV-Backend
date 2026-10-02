jest.mock('../../src/config/supabase', () => ({}))
jest.mock('../../src/services/shared/dailyDigestService', () => ({sendDailyDigest: jest.fn()}))
const reminderScheduleService = require('../../src/services/shared/reminderScheduleService')

// Acepta una configuracion valida de dias y horas
test('acepta dias y horas validos', () => {
  const result = reminderScheduleService.validateSchedule({activo: true, dias: [1, 2, 3, 4, 5], horas: ['08:00', '16:30']})
  expect(result).toBeNull()
})

// Exige al menos un dia cuando los recordatorios estan activos
test('rechaza recordatorios activos sin dias', () => {
  const result = reminderScheduleService.validateSchedule({activo: true, dias: [], horas: ['08:00']})
  expect(result).toBe('Elige al menos un día de la semana')
})

// Rechaza horas con formato invalido
test('rechaza una hora invalida', () => {
  const result = reminderScheduleService.validateSchedule({activo: true, dias: [1], horas: ['24:00']})
  expect(result).toBe('Las horas deben tener el formato HH:MM')
})

// Limita la cantidad de envios por dia
test('rechaza mas de cuatro horas por dia', () => {
  const result = reminderScheduleService.validateSchedule({activo: true, dias: [1], horas: ['08:00', '09:00', '10:00', '11:00', '12:00']})
  expect(result).toBe(`Puedes programar como máximo ${reminderScheduleService.maxTimes} envíos por día`)
})

// Permite guardar los recordatorios desactivados sin dias ni horas
test('acepta recordatorios desactivados', () => {
  const result = reminderScheduleService.validateSchedule({activo: false, dias: [], horas: []})
  expect(result).toBeNull()
})
