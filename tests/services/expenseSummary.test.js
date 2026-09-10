const expenseSummaryService = require('../../src/services/approval/expenseSummaryService')

// Verifica el calculo cuando no hay exceso de presupuesto
test('calcula el resumen sin exceder presupuesto', () => {
  const expenses = [
    {monto_total: '100', es_gasto_internacional: false},
    {monto_total: '50', es_gasto_internacional: false},
  ]
  const trip = {monto_asignado: '200', monto_asignado_usd: '0'}
  const result = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  expect(result.accumulatedExpense).toBe(150)
  expect(result.exceedsBudget).toBe(false)
})

// Verifica el calculo cuando si hay exceso de presupuesto
test('detecta cuando se excede el presupuesto nacional', () => {
  const expenses = [{monto_total: '300', es_gasto_internacional: false}]
  const trip = {monto_asignado: '200', monto_asignado_usd: '0'}
  const result = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  expect(result.exceedsBudget).toBe(true)
})

// Verifica que separe correctamente gastos nacionales de internacionales
test('separa gastos nacionales de internacionales', () => {
  const expenses = [
    {monto_total: '100', es_gasto_internacional: false},
    {monto_total: '50', es_gasto_internacional: true},
  ]
  const trip = {monto_asignado: '200', monto_asignado_usd: '100'}
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