// Calcula las retenciones sobre el total del documento; al proveedor se le cancela el total menos las retenciones
const calculateRetentions = (amount, type, isInternational, hasAlcohol) => {
  const amountNum = parseFloat(amount) || 0;
  const noRetentions = {base_imponible: amountNum, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: amountNum};
  if (hasAlcohol || isInternational || !['C', 'S'].includes(type)) {
    return noRetentions;
  }
  const it = parseFloat((amountNum * 0.03).toFixed(2));
  // Compra sin factura: IUE 5% e IT 3%; servicio sin factura: RC-IVA 13% e IT 3%
  if (type === 'C') {
    return {...noRetentions, retencion_iue: parseFloat((amountNum * 0.05).toFixed(2)), retencion_it: it};
  }
  return {...noRetentions, retencion_rc_iva: parseFloat((amountNum * 0.13).toFixed(2)), retencion_it: it};
};

// Retenciones de un gasto ya registrado, calculadas siempre desde su total para no arrastrar calculos antiguos
const getExpenseRetentions = (expense) => {
  return calculateRetentions(expense.monto_total, expense.tipo, !!expense.es_gasto_internacional, !!expense.tiene_alcohol);
};

module.exports = {calculateRetentions, getExpenseRetentions};
