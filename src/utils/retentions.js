const itRate = 0.03;
const centsFactor = 100;

// Redondea a centavos sin el error de coma flotante de toFixed en los medios centavos (1.005 -> 1.01)
const roundCents = (value) => Math.round((value + Number.EPSILON) * centsFactor) / centsFactor;

// La empresa asume los impuestos: lo pagado se incrementa a una base de la que salen las retenciones (base incrementada)
const calculateRetentions = (amount, type, isInternational, hasAlcohol) => {
  const paid = roundCents(parseFloat(amount) || 0);
  const noRetentions = {base_imponible: paid, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: paid};
  if (hasAlcohol || isInternational || !['C', 'S'].includes(type) || paid <= 0) {
    return noRetentions;
  }
  // Compra sin factura: IUE 5% e IT 3% (pagado / 0.92); servicio sin factura: RC-IVA 13% e IT 3% (pagado / 0.84)
  let mainRate = 0.13;
  if (type === 'C') {
    mainRate = 0.05;
  }
  // Cada retención sale de la base sin redondear, como lo calcula contabilidad, y la base es lo pagado más las retenciones
  const grossBase = paid / (1 - mainRate - itRate);
  const mainRetention = roundCents(grossBase * mainRate);
  const it = roundCents(grossBase * itRate);
  const base = roundCents(paid + mainRetention + it);
  if (type === 'C') {
    return {base_imponible: base, retencion_rc_iva: 0, retencion_iue: mainRetention, retencion_it: it, importe_costo: base};
  }
  return {base_imponible: base, retencion_rc_iva: mainRetention, retencion_iue: 0, retencion_it: it, importe_costo: base};
};

// Retenciones de un gasto ya registrado, calculadas siempre desde lo pagado para no arrastrar calculos antiguos
const getExpenseRetentions = (expense) => {
  return calculateRetentions(expense.monto_total, expense.tipo, !!expense.es_gasto_internacional, !!expense.tiene_alcohol);
};

module.exports = {roundCents, calculateRetentions, getExpenseRetentions};
