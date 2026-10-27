const itRate = 0.03;
const centsFactor = 100;

// Redondea a centavos sin el error de coma flotante de toFixed en los medios centavos (1.005 -> 1.01)
const roundCents = (value) => Math.round((value + Number.EPSILON) * centsFactor) / centsFactor;

// Tasa principal: RC-IVA 13% en servicios sin factura, IUE 5% en compras sin factura
const mainRateOf = (type) => {
  if (type === 'C') {
    return 0.05;
  }
  return 0.13;
};

// Retenciones de un solo monto: cada una sale con su porcentaje de la base sin redondear y la base es pagado + retenciones
const retentionsOfLine = (paid, mainRate) => {
  const grossBase = paid / (1 - mainRate - itRate);
  const main = roundCents(grossBase * mainRate);
  const it = roundCents(grossBase * itRate);
  return {paid, main, it, base: roundCents(paid + main + it)};
};

// Montos de cada línea del gasto: sus subgastos si suman lo pagado, o lo pagado como una sola línea
const resolveLines = (paid, lineAmounts) => {
  const lines = (lineAmounts || []).map((value) => roundCents(parseFloat(value) || 0)).filter((value) => value > 0);
  const linesTotal = roundCents(lines.reduce((sum, value) => sum + value, 0));
  if (lines.length === 0 || linesTotal !== paid) {
    return [paid];
  }
  return lines;
};

// Solo los servicios y compras sin factura, nacionales y sin alcohol llevan retenciones
const hasRetentions = (paid, type, isInternational, hasAlcohol) => !hasAlcohol && !isInternational && ['C', 'S'].includes(type) && paid > 0;

// La empresa asume los impuestos (base incrementada); con subgastos, cada uno se calcula aparte y se suman, como en el recibo de papel
const calculateRetentions = (amount, type, isInternational, hasAlcohol, lineAmounts = []) => {
  const paid = roundCents(parseFloat(amount) || 0);
  if (!hasRetentions(paid, type, isInternational, hasAlcohol)) {
    return {base_imponible: paid, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: paid};
  }
  const lines = resolveLines(paid, lineAmounts).map((line) => retentionsOfLine(line, mainRateOf(type)));
  const mainRetention = roundCents(lines.reduce((sum, line) => sum + line.main, 0));
  const it = roundCents(lines.reduce((sum, line) => sum + line.it, 0));
  const base = roundCents(paid + mainRetention + it);
  if (type === 'C') {
    return {base_imponible: base, retencion_rc_iva: 0, retencion_iue: mainRetention, retencion_it: it, importe_costo: base};
  }
  return {base_imponible: base, retencion_rc_iva: mainRetention, retencion_iue: 0, retencion_it: it, importe_costo: base};
};

// Importe con retenciones de cada subgasto, para las líneas del recibo; su suma es el total del recibo
const calculateLineBases = (amount, type, isInternational, hasAlcohol, lineAmounts = []) => {
  const paid = roundCents(parseFloat(amount) || 0);
  const lines = resolveLines(paid, lineAmounts);
  if (!hasRetentions(paid, type, isInternational, hasAlcohol)) {
    return lines;
  }
  return lines.map((line) => retentionsOfLine(line, mainRateOf(type)).base);
};

const usdCurrency = 'USD';

// Un gasto internacional nuevo guarda sus subgastos en la moneda de la factura; los antiguos, sin tipo de cambio a Bs, los guardaban en USD
const hasOriginCurrencyLines = (expense) => !!expense.es_gasto_internacional && parseFloat(expense.tipo_cambio_bs) > 0 && expense.moneda !== usdCurrency;

// Montos pagados de los subgastos; en moneda extranjera se pasan a USD y el ultimo absorbe el redondeo para que sumen el total
const subItemAmounts = (expense) => {
  const amounts = (expense.Gasto_Subitem || []).map((item) => parseFloat(item.monto) || 0);
  if (!hasOriginCurrencyLines(expense) || amounts.length === 0) {
    return amounts;
  }
  const exchangeRate = parseFloat(expense.tipo_cambio) || 1;
  const converted = amounts.map((amount) => roundCents(amount / exchangeRate));
  const difference = roundCents(parseFloat(expense.monto_total) - converted.reduce((sum, value) => sum + value, 0));
  converted[converted.length - 1] = roundCents(converted[converted.length - 1] + difference);
  return converted;
};

// Retenciones de un gasto ya registrado, calculadas siempre desde lo pagado para no arrastrar calculos antiguos
const getExpenseRetentions = (expense) => {
  return calculateRetentions(expense.monto_total, expense.tipo, !!expense.es_gasto_internacional, !!expense.tiene_alcohol, subItemAmounts(expense));
};

// Importes de las líneas de un gasto ya registrado
const getExpenseLineBases = (expense) => {
  return calculateLineBases(expense.monto_total, expense.tipo, !!expense.es_gasto_internacional, !!expense.tiene_alcohol, subItemAmounts(expense));
};

module.exports = {roundCents, calculateRetentions, getExpenseRetentions, getExpenseLineBases, hasOriginCurrencyLines};
