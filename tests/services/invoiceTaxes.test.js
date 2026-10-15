jest.mock('../../src/config/supabase', () => ({}));
jest.mock('../../src/services/shared/pdfService', () => ({}));
jest.mock('../../src/services/shared/geminiService', () => ({}));
const {getExpenseTaxValues} = require('../../src/services/trip/tripStatementService');
const {normalizeResult} = require('../../src/services/expense/invoiceExtractionService');

// La factura (F) calcula el IVA del 13% sobre el subtotal
test('la factura muestra el IVA del 13% en la planilla', () => {
  const expense = {tipo: 'F', monto_total: '113.00', Factura: {monto_parcial: '100.00'}};
  expect(getExpenseTaxValues(expense)).toEqual({vat: 13, rcIva: 0, iue: 0, it: 0, cost: 113});
});

// El recibo (R) no lleva IVA aunque tenga registro de factura
test('el recibo no muestra IVA en la planilla', () => {
  const expense = {tipo: 'R', monto_total: '80.00', Factura: {monto_parcial: '80.00'}};
  expect(getExpenseTaxValues(expense)).toEqual({vat: 0, rcIva: 0, iue: 0, it: 0, cost: 80});
});

// La extraccion conserva cantidades con decimales redondeadas a 2
test('la extracción admite cantidades con decimales', () => {
  const result = normalizeResult({detalle: [{nombre_producto: 'Gasolina', cantidad: 53.3456, precio: 3.74}, {nombre_producto: 'Naranja', cantidad: null, precio: 1}]});
  expect(result.detalle[0].cantidad).toBe(53.35);
  expect(result.detalle[1].cantidad).toBe(1);
});
