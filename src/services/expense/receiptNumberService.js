const supabase = require('../../config/supabase');

const receiptNumberDigits = 6;
const receiptTypes = ['C', 'S'];

// Completa el numero de recibo con ceros y le agrega su mes (000012/10-2026), porque el correlativo vuelve a 1 cada mes
const formatReceiptNumber = (number, period) => {
  const digits = String(number).padStart(receiptNumberDigits, '0');
  if (!period) {
    return digits;
  }
  const [year, month] = String(period).split('-');
  return `${digits}/${month}-${year}`;
};

// Mes actual en Bolivia (AAAA-MM), para el correlativo de recibos
const currentReceiptPeriod = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit'}).format(new Date()).slice(0, 7);

// Busca el recibo ya asignado (individual por gasto, o agrupado por viaje/tipo/moneda)
const findIssuedReceipt = async ({tripId, expenseId, type, isInternational}) => {
  let query = supabase.from('Recibo').select('id_recibo, numero, periodo, enviado');
  if (expenseId) {
    query = query.eq('id_gasto', expenseId);
  }
  else {
    query = query.eq('id_viaje', tripId).is('id_gasto', null).eq('tipo', type).eq('es_gasto_internacional', isInternational);
  }
  const {data} = await query.maybeSingle();
  return data;
};

// Toma el siguiente numero del correlativo y registra el recibo; si otro proceso se adelanto, usa el suyo
const reserveReceipt = async ({tripId, expenseId, type, isInternational, sent}) => {
  const period = currentReceiptPeriod();
  const {data: correlativeData, error} = await supabase.rpc('incrementar_correlativo_recibo', {p_periodo: period});
  if (error) {
    return {error: 'Error al generar el número de recibo'};
  }
  const {error: insertError} = await supabase.from('Recibo').insert({
    numero: correlativeData,
    periodo: period,
    id_viaje: tripId,
    id_gasto: expenseId,
    tipo: type,
    es_gasto_internacional: isInternational,
    enviado: sent,
  });
  if (insertError) {
    const concurrent = await findIssuedReceipt({tripId, expenseId, type, isInternational});
    if (concurrent) {
      return {receipt: concurrent};
    }
    return {error: 'Error al registrar el número de recibo'};
  }
  return {receipt: {numero: correlativeData, periodo: period, enviado: false}};
};

// Numero del recibo que se va a enviar; reissued indica si ya se habia enviado antes
const getReceiptNumber = async ({tripId, expenseId = null, type, isInternational}) => {
  const existing = await findIssuedReceipt({tripId, expenseId, type, isInternational});
  if (existing) {
    if (!existing.enviado) {
      await supabase.from('Recibo').update({enviado: true}).eq('id_recibo', existing.id_recibo);
    }
    return {receiptNumber: formatReceiptNumber(existing.numero, existing.periodo), reissued: !!existing.enviado};
  }
  const {receipt, error} = await reserveReceipt({tripId, expenseId, type, isInternational, sent: true});
  if (error) {
    return {error};
  }
  return {receiptNumber: formatReceiptNumber(receipt.numero, receipt.periodo), reissued: !!receipt.enviado};
};

// Da a un gasto sin factura su numero de recibo del sistema al registrarlo o editarlo, y lo mantiene al dia con su tipo
const assignExpenseReceipt = async (expense) => {
  if (!receiptTypes.includes(expense.tipo)) {
    return {receiptNumber: null};
  }
  const selection = {tripId: expense.id_viaje, expenseId: expense.id_gasto, type: expense.tipo, isInternational: !!expense.es_gasto_internacional};
  const existing = await findIssuedReceipt(selection);
  if (existing) {
    await supabase.from('Recibo').update({tipo: selection.type, es_gasto_internacional: selection.isInternational}).eq('id_recibo', existing.id_recibo);
    return {receiptNumber: formatReceiptNumber(existing.numero, existing.periodo)};
  }
  const {receipt, error} = await reserveReceipt({...selection, sent: false});
  if (error) {
    return {error};
  }
  return {receiptNumber: formatReceiptNumber(receipt.numero, receipt.periodo)};
};

module.exports = {formatReceiptNumber, currentReceiptPeriod, getReceiptNumber, assignExpenseReceipt};
