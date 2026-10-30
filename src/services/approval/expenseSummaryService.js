const {spentAgainstFunds, hasUsdFund, amountInBsOf} = require('../../utils/expenseCurrency');
const {roundCents} = require('../../utils/retentions');

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
  // Viaje internacional con fondo solo en Bs: todo se controla en Bs, y los dias intermedios con la tarifa en USD pasada a Bs
  const onlyBsFund = trip.tipo === 'Internacional' && !hasUsdFund(trip);
  const dailyTotals = {};
  nonHotelExpenses.forEach((expense) => {
    const day = expense.fecha_gasto;
    if (!day) {
      return;
    }
    if (!dailyTotals[day]) {
      dailyTotals[day] = {fecha: day, montoBs: 0, montoUsd: 0, usdConvertidos: 0, bsConvertidos: 0};
    }
    const amount = parseFloat(expense.monto_total || 0);
    const amountBs = amountInBsOf(expense);
    if (!expense.es_gasto_internacional) {
      dailyTotals[day].montoBs += amount;
    }
    else if (onlyBsFund && amountBs !== null) {
      dailyTotals[day].montoBs += amountBs;
      dailyTotals[day].usdConvertidos += amount;
      dailyTotals[day].bsConvertidos += amountBs;
    }
    else {
      dailyTotals[day].montoUsd += amount;
    }
  });
  const totals = Object.values(dailyTotals);
  const tripUsd = totals.reduce((sum, day) => sum + day.usdConvertidos, 0);
  const tripBs = totals.reduce((sum, day) => sum + day.bsConvertidos, 0);
  const dailyBreakdown = totals
    .map(({usdConvertidos, bsConvertidos, ...day}) => {
      let limitBs = dailyRate;
      let exchangeRate = null;
      const isMiddleDay = day.fecha > trip.fecha_inicio && day.fecha < trip.fecha_fin;
      if (onlyBsFund && isMiddleDay) {
        // Tipo de cambio de los gastos del dia; si ese dia no hay gastos en el exterior, el promedio del viaje
        if (usdConvertidos > 0) {
          exchangeRate = bsConvertidos / usdConvertidos;
        }
        else if (tripUsd > 0) {
          exchangeRate = tripBs / tripUsd;
        }
        if (exchangeRate) {
          limitBs = roundCents(dailyRateUsd * exchangeRate);
          exchangeRate = Math.round(exchangeRate * 10000) / 10000;
        }
      }
      return {
        ...day,
        montoBs: roundCents(day.montoBs),
        montoUsd: roundCents(day.montoUsd),
        limiteBs: limitBs,
        limiteUsd: dailyRateUsd,
        soloBs: onlyBsFund,
        tipoCambio: exchangeRate,
        excedeBs: roundCents(day.montoBs) > limitBs,
        excedeUsd: roundCents(day.montoUsd) > dailyRateUsd,
      };
    })
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
