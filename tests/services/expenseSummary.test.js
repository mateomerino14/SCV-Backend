const expenseSummaryService = require('../../src/services/approval/expenseSummaryService')

const tripWithDailyRate = (dailyRate, dailyRateUsd = 0, monto_asignado = 0, monto_asignado_usd = 0) => ({
  monto_asignado,
  monto_asignado_usd,
  Usuario: {Cargo: {monto_diario: dailyRate, monto_diario_usd: dailyRateUsd}},
})

// Verifica el calculo cuando ningun dia excede la cuota diaria
test('calcula el resumen sin exceder la cuota diaria', () => {
  const expenses = [
    {monto_total: '50', fecha_gasto: '2026-01-01', es_gasto_internacional: false},
    {monto_total: '50', fecha_gasto: '2026-01-02', es_gasto_internacional: false},
  ]
  const trip = tripWithDailyRate(100)
  const result = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  expect(result.accumulatedExpense).toBe(100)
  expect(result.exceedsBudget).toBe(false)
  expect(result.exceededDays).toHaveLength(0)
})

// Verifica que detecte un dia puntual que excede la cuota diaria, aunque el total no exceda
test('detecta un dia que excede la cuota diaria', () => {
  const expenses = [
    {monto_total: '150', fecha_gasto: '2026-01-01', es_gasto_internacional: false},
    {monto_total: '10', fecha_gasto: '2026-01-02', es_gasto_internacional: false},
  ]
  const trip = tripWithDailyRate(100)
  const result = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  expect(result.exceedsBudget).toBe(true)
  expect(result.exceededDays).toHaveLength(1)
  expect(result.exceededDays[0].fecha).toBe('2026-01-01')
})

// Verifica que sumar varios gastos del mismo dia se compare junto contra la cuota
test('suma varios gastos del mismo dia antes de comparar con la cuota', () => {
  const expenses = [
    {monto_total: '60', fecha_gasto: '2026-01-01', es_gasto_internacional: false},
    {monto_total: '60', fecha_gasto: '2026-01-01', es_gasto_internacional: false},
  ]
  const trip = tripWithDailyRate(100)
  const result = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  expect(result.exceedsBudget).toBe(true)
  expect(result.exceededDays[0].montoBs).toBe(120)
})

// Verifica que los gastos de hotel no consuman la cuota diaria
test('los gastos de hotel no consumen la cuota diaria', () => {
  const expenses = [
    {monto_total: '500', fecha_gasto: '2026-01-01', es_gasto_internacional: false, Categoria_Gasto: {nombre: '626030 HOTELES (VIAJE)'}},
    {monto_total: '50', fecha_gasto: '2026-01-01', es_gasto_internacional: false},
  ]
  const trip = tripWithDailyRate(100, 0, 1000)
  const result = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  expect(result.exceededDays).toHaveLength(0)
  expect(result.hotelAccumulated).toBe(500)
})

// Verifica que los gastos de hotel se controlen contra el total del viaje, no contra el dia
test('los gastos de hotel exceden cuando superan el total del viaje', () => {
  const expenses = [
    {monto_total: '1200', fecha_gasto: '2026-01-01', es_gasto_internacional: false, Categoria_Gasto: {nombre: '626030 HOTELES (VIAJE)'}},
  ]
  const trip = tripWithDailyRate(100, 0, 1000)
  const result = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  expect(result.hotelExceeds).toBe(true)
  expect(result.exceedsBudget).toBe(true)
})

// Verifica que separe correctamente gastos nacionales de internacionales en los totales generales
test('separa gastos nacionales de internacionales', () => {
  const expenses = [
    {monto_total: '100', fecha_gasto: '2026-01-01', es_gasto_internacional: false},
    {monto_total: '50', fecha_gasto: '2026-01-02', es_gasto_internacional: true},
  ]
  const trip = tripWithDailyRate(200, 200)
  const result = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  expect(result.accumulatedExpense).toBe(100)
  expect(result.accumulatedExpenseUsd).toBe(50)
})

// Verifica que construya la alerta de exceso de presupuesto
test('agrega la alerta de exceso de presupuesto', () => {
  const summary = {exceedsBudget: true, exceedsBudgetUsd: false}
  const trip = {tiene_alcohol: false}
  const result = expenseSummaryService.buildReviewAlerts(summary, trip)
  expect(result.alerts).toContain('EXCESO_PRESUPUESTO')
  expect(result.reviewStatus).toBe('OBSERVADO')
})

// Verifica que construya la alerta de alcohol
test('agrega la alerta de alcohol', () => {
  const summary = {exceedsBudget: false, exceedsBudgetUsd: false}
  const trip = {tiene_alcohol: true}
  const result = expenseSummaryService.buildReviewAlerts(summary, trip)
  expect(result.alerts).toContain('ALCOHOL')
})

// Verifica que no haya alertas cuando todo esta conforme
test('no genera alertas cuando el viaje esta conforme', () => {
  const summary = {exceedsBudget: false, exceedsBudgetUsd: false}
  const trip = {tiene_alcohol: false}
  const result = expenseSummaryService.buildReviewAlerts(summary, trip)
  expect(result.alerts).toHaveLength(0)
  expect(result.reviewStatus).toBe('CONFORME')
})
