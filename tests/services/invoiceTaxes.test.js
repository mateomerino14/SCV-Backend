jest.mock('../../src/config/supabase', () => ({}));
jest.mock('../../src/services/shared/pdfService', () => ({}));
jest.mock('../../src/services/shared/geminiService', () => ({}));
const {getExpenseTaxValues} = require('../../src/services/trip/tripStatementService');
const {normalizeResult} = require('../../src/services/expense/invoiceExtractionService');

// La factura (F) calcula el IVA del 13% sobre el subtotal y el costo es el importe sin IVA
test('la factura muestra el IVA del 13% y el costo sin IVA en la planilla', () => {
  const expense = {tipo: 'F', monto_total: '113.00', Factura: {monto_parcial: '100.00'}};
  expect(getExpenseTaxValues(expense)).toEqual({vat: 13, rcIva: 0, iue: 0, it: 0, cost: 100});
  const fuel = {tipo: 'F', monto_total: '305.00', Factura: {monto_parcial: '269.91'}};
  expect(getExpenseTaxValues(fuel)).toEqual({vat: 35.09, rcIva: 0, iue: 0, it: 0, cost: 269.91});
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

// Una factura con solo el total separa el IVA por dentro, sin cambiar el total
test('la factura extraída con solo el total separa el IVA por dentro', () => {
  const result = normalizeResult({tipo_doc: 'F', monto_total: 305});
  expect(result).toMatchObject({tipo_doc: 'F', monto: 269.91, iva: 35.09, monto_total: 305});
  const explicit = normalizeResult({tipo_doc: 'F', monto: 100, iva: 13, monto_total: 113});
  expect(explicit).toMatchObject({monto: 100, iva: 13, monto_total: 113});
});
