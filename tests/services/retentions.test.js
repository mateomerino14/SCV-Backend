jest.mock('../../src/config/supabase', () => ({}));
const {roundCents, calculateRetentions, getExpenseRetentions} = require('../../src/utils/retentions');

// Servicio sin factura: lo pagado se incrementa (/ 0.84) y de esa base salen el RC-IVA 13% y el IT 3%
test('calcula las retenciones de un servicio con base incrementada', () => {
  const result = calculateRetentions(40, 'S', false, false);
  expect(result).toEqual({base_imponible: 47.62, retencion_rc_iva: 6.19, retencion_iue: 0, retencion_it: 1.43, importe_costo: 47.62});
  expect(parseFloat((40 + result.retencion_rc_iva + result.retencion_it).toFixed(2))).toBe(47.62);
});

// Cada retención sale de la base sin redondear, como contabilidad: 50 Bs da IT 1.79 y base 59.53
test('calcula cada retención con su porcentaje y suma la base como contabilidad', () => {
  expect(calculateRetentions(50, 'S', false, false)).toEqual({base_imponible: 59.53, retencion_rc_iva: 7.74, retencion_iue: 0, retencion_it: 1.79, importe_costo: 59.53});
  expect(calculateRetentions(180, 'S', false, false)).toMatchObject({base_imponible: 214.29, retencion_rc_iva: 27.86, retencion_it: 6.43});
});

// Compra sin factura: lo pagado se incrementa (/ 0.92) y de esa base salen el IUE 5% y el IT 3%
test('calcula las retenciones de una compra con base incrementada', () => {
  expect(calculateRetentions(92, 'C', false, false)).toEqual({base_imponible: 100, retencion_rc_iva: 0, retencion_iue: 5, retencion_it: 3, importe_costo: 100});
});

// Facturas, recibos, gastos internacionales y con alcohol no llevan retenciones
test('no retiene en facturas, recibos, gastos internacionales ni con alcohol', () => {
  const none = {base_imponible: 50, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: 50};
  expect(calculateRetentions(50, 'F', false, false)).toEqual(none);
  expect(calculateRetentions(50, 'R', false, false)).toEqual(none);
  expect(calculateRetentions(50, 'S', true, false)).toEqual(none);
  expect(calculateRetentions(50, 'S', false, true)).toEqual(none);
});

// El recibo muestra la base incrementada, las retenciones y lo pagado como importe a cancelar
test('el recibo muestra la base incrementada y cancela lo pagado', () => {
  jest.isolateModules(() => {
    jest.doMock('../../src/services/shared/emailService', () => ({}));
    jest.doMock('../../src/services/shared/pdfService', () => ({}));
    const {generateIndividualReceiptHtml} = require('../../src/services/expense/receiptService');
    const expense = {tipo: 'S', monto_total: 40, fecha_gasto: '2026-10-15', descripcion: 'Taxi', Gasto_Subitem: [{descripcion: 'Ida', monto: 25}, {descripcion: 'Vuelta', monto: 15}]};
    const html = generateIndividualReceiptHtml(expense, {nombre: 'Juan'}, 1, 'V-1', 'Prueba', null);
    expect(html).toContain('<span>TOTAL IMPORTE</span><span>47.62</span>');
    expect(html).toContain('<span>IMPORTE A CANCELAR</span><span>40.00</span>');
    expect(html).toContain('>29.76<');
    expect(html).toContain('>17.86<');
  });
});

// Un gasto guardado con otro calculo se muestra con la base incrementada desde lo pagado
test('recalcula las retenciones de un gasto registrado desde lo pagado', () => {
  const savedExpense = {tipo: 'S', monto_total: '40.00', retencion_rc_iva: '0', retencion_it: '0', importe_costo: '40.00'};
  expect(getExpenseRetentions(savedExpense)).toMatchObject({retencion_rc_iva: 6.19, retencion_it: 1.43, importe_costo: 47.62});
});

// Los medios centavos se redondean hacia arriba, sin el error de toFixed
test('redondea los medios centavos hacia arriba', () => {
  expect(roundCents(1.005)).toBe(1.01);
  expect(roundCents(2.675)).toBe(2.68);
});
