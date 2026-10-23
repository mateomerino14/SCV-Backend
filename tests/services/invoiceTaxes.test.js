jest.mock('../../src/config/supabase', () => ({}));
jest.mock('../../src/services/shared/pdfService', () => ({}));
jest.mock('../../src/services/shared/geminiService', () => ({}));
const {getExpenseTaxValues} = require('../../src/services/trip/tripStatementService');
const {normalizeResult} = require('../../src/services/expense/invoiceExtractionService');

// La factura (F) tiene un IVA del 13% del total, que se resta del costo
test('la factura muestra el IVA del 13% del total y el costo sin IVA en la planilla', () => {
  const expense = {tipo: 'F', monto_total: '100.00', Factura: {monto_parcial: '87.00'}};
  expect(getExpenseTaxValues(expense)).toEqual({vat: 13, rcIva: 0, iue: 0, it: 0, cost: 87});
  const fuel = {tipo: 'F', monto_total: '305.00', Factura: {monto_parcial: '265.35'}};
  expect(getExpenseTaxValues(fuel)).toEqual({vat: 39.65, rcIva: 0, iue: 0, it: 0, cost: 265.35});
});

// El recibo (R) no lleva IVA aunque tenga registro de factura
test('el recibo no muestra IVA en la planilla', () => {
  const expense = {tipo: 'R', monto_total: '80.00', Factura: {monto_parcial: '80.00'}};
  expect(getExpenseTaxValues(expense)).toEqual({vat: 0, rcIva: 0, iue: 0, it: 0, cost: 80});
});

// La extraccion conserva cantidades con decimales redondeadas a 3
test('la extracción admite cantidades con decimales', () => {
  const result = normalizeResult({detalle: [{nombre_producto: 'Gasolina', cantidad: 53.3456, precio: 3.74}, {nombre_producto: 'Naranja', cantidad: null, precio: 1}]});
  expect(result.detalle[0].cantidad).toBe(53.346);
  expect(result.detalle[1].cantidad).toBe(1);
});

// En un recibo extraido el monto es el total pagado, sin el 13% descontado
test('el recibo extraído no descuenta el IVA del total', () => {
  const result = normalizeResult({tipo_doc: 'R', monto: 88.5, iva: 11.5, monto_total: 100, numero_factura: 'BOL-$45@7'});
  expect(result).toMatchObject({tipo_doc: 'R', monto: 100, iva: 0, monto_total: 100, numero_factura: 'BOL-$45@7'});
});

// En una factura extraida el IVA es el 13% del total y se resta de el, sin cambiar el total
test('la factura extraída resta del total un IVA del 13%', () => {
  const result = normalizeResult({tipo_doc: 'F', monto_total: 305});
  expect(result).toMatchObject({tipo_doc: 'F', monto: 265.35, iva: 39.65, monto_total: 305});
  const subtotalBased = normalizeResult({tipo_doc: 'F', monto: 100, iva: 13, monto_total: 113});
  expect(subtotalBased).toMatchObject({monto: 98.31, iva: 14.69, monto_total: 113});
  const explicit = normalizeResult({tipo_doc: 'F', monto: 87, iva: 13, monto_total: 100});
  expect(explicit).toMatchObject({monto: 87, iva: 13, monto_total: 100});
});

// En la planilla, un gasto sin factura suma sus retenciones a lo pagado: el costo es la base incrementada
test('la planilla suma las retenciones a lo pagado en un gasto sin factura', () => {
  const service = {tipo: 'S', monto_total: '40.00'};
  expect(getExpenseTaxValues(service)).toEqual({vat: 0, rcIva: 6.19, iue: 0, it: 1.43, cost: 47.62});
});
