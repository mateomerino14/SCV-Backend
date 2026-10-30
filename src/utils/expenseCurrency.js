const {roundCents} = require('./retentions');

const usdCurrency = 'USD';

// Bolivianos por 1 USD guardados en el gasto internacional, o 0 si es antiguo y no los tiene
const bsRateOf = (expense) => parseFloat(expense.tipo_cambio_bs) || 0;

// Importe del gasto en Bs: los nacionales tal cual y los internacionales con su tipo de cambio; null si no se puede convertir
const amountInBsOf = (expense) => {
  const amount = parseFloat(expense.monto_total) || 0;
  if (!expense.es_gasto_internacional) {
    return amount;
  }
  const rate = bsRateOf(expense);
  if (rate > 0) {
    return roundCents(amount * rate);
  }
  return null;
};

// Lineas que muestran el monto original de un gasto internacional y sus tipos de cambio
const originalAmountLinesOf = (expense) => {
  if (!expense.es_gasto_internacional) {
    return [];
  }
  const usd = (parseFloat(expense.monto_total) || 0).toFixed(2);
  const rate = bsRateOf(expense);
  const segments = expense.Gasto_Tramo_Moneda || [];
  const lines = [];
  if (rate > 0 && expense.moneda && expense.moneda !== usdCurrency) {
    lines.push(`${parseFloat(expense.monto_moneda_origen).toFixed(2)} ${expense.moneda} = ${usd} USD (T/C ${parseFloat(expense.tipo_cambio).toFixed(4)})`);
  }
  else if (rate === 0 && segments.length > 0) {
    lines.push(...segments.map((segment) => `${parseFloat(segment.monto_origen).toFixed(2)} ${segment.moneda} = ${parseFloat(segment.monto_usd).toFixed(2)} USD`));
  }
  else {
    lines.push(`${usd} USD`);
  }
  if (rate > 0) {
    lines.push(`T/C ${rate.toFixed(4)} Bs por USD`);
  }
  else {
    lines.push('Sin T/C a Bs');
  }
  return lines;
};

// Indica si el viaje recibio fondo en dolares; si no, todo se entrego en bolivianos
const hasUsdFund = (trip) => (parseFloat(trip?.monto_asignado_usd) || 0) > 0;

// Moneda en la que se rinde un gasto internacional: la que eligio el empleado o, si no eligio, la del fondo del viaje
const renditionCurrencyOf = (trip, expense) => {
  if (expense.moneda_rendicion === usdCurrency || expense.moneda_rendicion === 'BOB') {
    return expense.moneda_rendicion;
  }
  if (hasUsdFund(trip)) {
    return usdCurrency;
  }
  return 'BOB';
};

// Indica si el gasto internacional se rinde en USD (tambien si no tiene tipo de cambio a Bs)
const isRenderedInUsd = (trip, expense) => !!expense.es_gasto_internacional && (renditionCurrencyOf(trip, expense) === usdCurrency || amountInBsOf(expense) === null);

// Gasto descontado de cada fondo: los internacionales salen del fondo en USD si el viaje lo tiene; si no, del fondo en Bs con su tipo de cambio
const spentAgainstFunds = (trip, expenses) => {
  let spentBs = 0;
  let spentUsd = 0;
  let internationalUsd = 0;
  (expenses || []).forEach((expense) => {
    const amount = parseFloat(expense.monto_total) || 0;
    if (!expense.es_gasto_internacional) {
      spentBs += amount;
      return;
    }
    internationalUsd += amount;
    if (isRenderedInUsd(trip, expense)) {
      spentUsd += amount;
    }
    else {
      spentBs += amountInBsOf(expense);
    }
  });
  return {spentBs: roundCents(spentBs), spentUsd: roundCents(spentUsd), internationalUsd: roundCents(internationalUsd)};
};

// Totales y saldos de la planilla a partir del gasto descontado de cada fondo
const summarizeStatement = (trip, expenses) => {
  const fundBs = parseFloat(trip.monto_asignado) || 0;
  const fundUsd = parseFloat(trip.monto_asignado_usd) || 0;
  const {spentBs, spentUsd, internationalUsd} = spentAgainstFunds(trip, expenses);
  const remainingBs = roundCents(fundBs - spentBs);
  const remainingUsd = roundCents(fundUsd - spentUsd);
  return {
    internationalUsd,
    balanceRows: [
      ['Fondo Recibido', fundBs, fundUsd],
      ['Total Gastado', spentBs, spentUsd],
      ['Saldo en mi poder', remainingBs, remainingUsd],
      ['Importe a Devolver', Math.max(remainingBs, 0), Math.max(remainingUsd, 0)],
      ['Importe a Reembolsar', Math.max(-remainingBs, 0), Math.max(-remainingUsd, 0)],
    ],
  };
};

module.exports = {amountInBsOf, originalAmountLinesOf, hasUsdFund, isRenderedInUsd, spentAgainstFunds, summarizeStatement};
