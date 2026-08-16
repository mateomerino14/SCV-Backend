// Calcula el resumen de gastos acumulados de un viaje contra su presupuesto
const calculateExpenseSummary = (expenses, trip) => {
  const nationalExpenses = (expenses || []).filter((expense) => !expense.es_gasto_internacional)
  const internationalExpenses = (expenses || []).filter((expense) => !!expense.es_gasto_internacional)
  const accumulatedExpense = nationalExpenses.reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
  const accumulatedExpenseUsd = internationalExpenses.reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
  const exceedsBudget = accumulatedExpense > parseFloat(trip.monto_asignado)
  const exceedsBudgetUsd = accumulatedExpenseUsd > parseFloat(trip.monto_asignado_usd || 0)
  return {accumulatedExpense, accumulatedExpenseUsd, exceedsBudget, exceedsBudgetUsd}
};

// Construye las alertas y el estado de revision a partir del resumen de gastos
const buildReviewAlerts = (summary, trip) => {
  const alerts = []
  if (summary.exceedsBudget || summary.exceedsBudgetUsd) {
    alerts.push('EXCESO_PRESUPUESTO')
  }
  if (trip.tiene_alcohol === true) {
    alerts.push('ALCOHOL')
  }
  let reviewStatus = 'CONFORME'
  if (alerts.length > 0) {
    reviewStatus = 'OBSERVADO'
  }
  return {alerts, reviewStatus}
};

module.exports = {calculateExpenseSummary, buildReviewAlerts};