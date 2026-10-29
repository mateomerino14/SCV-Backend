const {spentAgainstFunds} = require('../../utils/expenseCurrency');

// Determina si un gasto corresponde a la categoria de hoteles
const isHotelExpense = (expense) => {
  const categoryName = expense.Categoria_Gasto?.nombre || '';
  return categoryName.toUpperCase().includes('HOTEL');
};

// Determina si un gasto es combustible (gas, gasolina o diesel), que se paga del fondo aparte del vehiculo
const isFuelExpense = (expense) => {
  const categoryName = expense.Categoria_Gasto?.nombre || '';
  return ['628020', '628021', '628022'].some((code) => categoryName.startsWith(code));
};

// Resume los gastos: hoteles contra el total del viaje y el resto por dia contra la cuota del cargo
const calculateExpenseSummary = (expenses, trip) => {
  const allExpenses = expenses || [];
  const hotelExpenses = allExpenses.filter(isHotelExpense);
  // Con fondo aparte para combustible, la gasolina no cuenta en la cuota diaria
  const hasFuelFund = parseFloat(trip.monto_combustible || 0) > 0;
  const nonHotelExpenses = allExpenses.filter((expense) => !isHotelExpense(expense) && !(hasFuelFund && isFuelExpense(expense)));

  const spent = spentAgainstFunds(trip, allExpenses);
  const accumulatedExpense = spent.spentBs;
  const accumulatedExpenseUsd = spent.spentUsd;

  const hotelSpent = spentAgainstFunds(trip, hotelExpenses);
  const hotelAccumulated = hotelSpent.spentBs;
  const hotelAccumuladoUsd = hotelSpent.spentUsd;
  const hotelExceeds = hotelAccumulated > parseFloat(trip.monto_asignado || 0);
  const hotelExceedsUsd = hotelAccumuladoUsd > parseFloat(trip.monto_asignado_usd || 0);

  const dailyRate = parseFloat(trip.Usuario?.Cargo?.monto_diario || 0);
  const dailyRateUsd = parseFloat(trip.Usuario?.Cargo?.monto_diario_usd || 0);
  const dailyTotals = {};
  nonHotelExpenses.forEach((expense) => {
    const day = expense.fecha_gasto;
    if (!day) {
      return;
    }
    if (!dailyTotals[day]) {
      dailyTotals[day] = {fecha: day, montoBs: 0, montoUsd: 0};
    }
    if (expense.es_gasto_internacional) {
      dailyTotals[day].montoUsd += parseFloat(expense.monto_total || 0);
    }
    else {
      dailyTotals[day].montoBs += parseFloat(expense.monto_total || 0);
    }
  });
  const dailyBreakdown = Object.values(dailyTotals)
    .map((day) => ({
      ...day,
      excedeBs: day.montoBs > dailyRate,
      excedeUsd: day.montoUsd > dailyRateUsd,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const exceededDays = dailyBreakdown.filter((day) => day.excedeBs || day.excedeUsd);

  const exceedsBudget = hotelExceeds || exceededDays.some((day) => day.excedeBs);
  const exceedsBudgetUsd = hotelExceedsUsd || exceededDays.some((day) => day.excedeUsd);
  const totalExceeds = accumulatedExpense > parseFloat(trip.monto_asignado || 0);
  const totalExceedsUsd = accumulatedExpenseUsd > parseFloat(trip.monto_asignado_usd || 0);

  return {
    accumulatedExpense,
    accumulatedExpenseUsd,
    exceedsBudget,
    exceedsBudgetUsd,
    totalExceeds,
    totalExceedsUsd,
    dailyRate,
    dailyRateUsd,
    dailyBreakdown,
    exceededDays,
    hotelAccumulated,
    hotelAccumuladoUsd,
    hotelExceeds,
    hotelExceedsUsd,
  };
};

// Construye las alertas y el estado de revision a partir del resumen de gastos
const buildReviewAlerts = (summary, trip) => {
  const alerts = [];
  if (summary.exceedsBudget || summary.exceedsBudgetUsd) {
    alerts.push('EXCESO_PRESUPUESTO');
  }
  if (trip.tiene_alcohol === true) {
    alerts.push('ALCOHOL');
  }
  let reviewStatus = 'CONFORME';
  if (alerts.length > 0) {
    reviewStatus = 'OBSERVADO';
  }
  return {alerts, reviewStatus};
};

module.exports = {calculateExpenseSummary, buildReviewAlerts};
