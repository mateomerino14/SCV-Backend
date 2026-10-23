// La empresa asume los impuestos: lo pagado se incrementa a una base de la que salen las retenciones (base incrementada)
const calculateRetentions = (amount, type, isInternational, hasAlcohol) => {
  const paid = parseFloat(amount) || 0;
  const noRetentions = {base_imponible: paid, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: paid};
  if (hasAlcohol || isInternational || !['C', 'S'].includes(type) || paid <= 0) {
    return noRetentions;
  }
  // Compra sin factura: IUE 5% e IT 3% (pagado / 0.92); servicio sin factura: RC-IVA 13% e IT 3% (pagado / 0.84)
  let mainRate = 0.13;
  if (type === 'C') {
    mainRate = 0.05;
  }
  const base = parseFloat((paid / (1 - mainRate - 0.03)).toFixed(2));
  const mainRetention = parseFloat((base * mainRate).toFixed(2));
  // El IT cierra la cuenta para que pagado + retenciones sea exactamente la base
  const it = parseFloat((base - paid - mainRetention).toFixed(2));
  if (type === 'C') {
    return {base_imponible: base, retencion_rc_iva: 0, retencion_iue: mainRetention, retencion_it: it, importe_costo: base};
  }
  return {base_imponible: base, retencion_rc_iva: mainRetention, retencion_iue: 0, retencion_it: it, importe_costo: base};
};

// Retenciones de un gasto ya registrado, calculadas siempre desde lo pagado para no arrastrar calculos antiguos
const getExpenseRetentions = (expense) => {
  return calculateRetentions(expense.monto_total, expense.tipo, !!expense.es_gasto_internacional, !!expense.tiene_alcohol);
};

module.exports = {calculateRetentions, getExpenseRetentions};
