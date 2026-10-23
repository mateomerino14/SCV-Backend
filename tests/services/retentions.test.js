jest.mock('../../src/config/supabase', () => ({}));
const {calculateRetentions, getExpenseRetentions} = require('../../src/utils/retentions');

// Servicio sin factura: RC-IVA 13% e IT 3% sobre el total; se cancela el total menos las retenciones
test('calcula las retenciones de un servicio sobre el total del documento', () => {
  const result = calculateRetentions(47.62, 'S', false, false);
  expect(result).toEqual({base_imponible: 47.62, retencion_rc_iva: 6.19, retencion_iue: 0, retencion_it: 1.43, importe_costo: 47.62});
  expect(parseFloat((47.62 - result.retencion_rc_iva - result.retencion_it).toFixed(2))).toBe(40);
});

// Compra sin factura: IUE 5% e IT 3% sobre el total
test('calcula las retenciones de una compra sobre el total del documento', () => {
  expect(calculateRetentions(100, 'C', false, false)).toEqual({base_imponible: 100, retencion_rc_iva: 0, retencion_iue: 5, retencion_it: 3, importe_costo: 100});
});

// Facturas, recibos, gastos internacionales y con alcohol no llevan retenciones
test('no retiene en facturas, recibos, gastos internacionales ni con alcohol', () => {
  const none = {base_imponible: 50, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: 50};
  expect(calculateRetentions(50, 'F', false, false)).toEqual(none);
  expect(calculateRetentions(50, 'R', false, false)).toEqual(none);
  expect(calculateRetentions(50, 'S', true, false)).toEqual(none);
  expect(calculateRetentions(50, 'S', false, true)).toEqual(none);
});

// El recibo muestra el total, las retenciones y el importe a cancelar como en el documento del proveedor
test('el recibo cancela el total menos las retenciones', () => {
  jest.isolateModules(() => {
    jest.doMock('../../src/services/shared/emailService', () => ({}));
    jest.doMock('../../src/services/shared/pdfService', () => ({}));
    const {generateIndividualReceiptHtml} = require('../../src/services/expense/receiptService');
    const expense = {tipo: 'S', monto_total: 47.62, retencion_rc_iva: 6.19, retencion_it: 1.43, fecha_gasto: '2026-10-15', descripcion: 'Taxi', Gasto_Subitem: []};
    const html = generateIndividualReceiptHtml(expense, {nombre: 'Juan'}, 1, 'V-1', 'Prueba', null);
    expect(html).toContain('<span>TOTAL IMPORTE</span><span>47.62</span>');
    expect(html).toContain('<span>IMPORTE A CANCELAR</span><span>40.00</span>');
  });
});

// Un gasto viejo guardado con el calculo anterior se muestra con las retenciones sobre su total
test('recalcula las retenciones de un gasto registrado desde su total', () => {
  const oldExpense = {tipo: 'S', monto_total: '47.62', retencion_rc_iva: '7.37', retencion_it: '1.70', importe_costo: '56.69'};
  expect(getExpenseRetentions(oldExpense)).toMatchObject({retencion_rc_iva: 6.19, retencion_it: 1.43, importe_costo: 47.62});
});
