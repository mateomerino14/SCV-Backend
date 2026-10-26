jest.mock('../../src/config/supabase', () => ({}));
const {generateStatementHtml} = require('../../src/services/trip/tripStatementService');
const {summarizeStatement, originalAmountLinesOf} = require('../../src/utils/expenseCurrency');

const trip = {tipo: 'Internacional', fecha_inicio: '2026-10-01', motivo: 'Feria en Lima', monto_asignado: '1000', monto_asignado_usd: '0', Usuario: {nombre: 'Ana', apellido_paterno: 'Rojas'}};
const nationalExpense = {tipo: 'S', monto_total: '50.00', fecha_gasto: '2026-10-01', descripcion: 'Taxi al aeropuerto', es_gasto_internacional: false, numero_recibo: '0003431', Recibo: [{numero: 12}]};
const internationalExpense = {
  tipo: 'C', monto_total: '44.97', fecha_gasto: '2026-10-02', descripcion: 'Taxi en Lima', es_gasto_internacional: true,
  moneda: 'PEN', monto_moneda_origen: '170.00', tipo_cambio: '3.7800', tipo_cambio_bs: '6.9600', Recibo: [{numero: 13}],
};

// La planilla de un viaje internacional va toda en Bs, con el monto original y los tipos de cambio de cada gasto
test('muestra los gastos internacionales en Bs con su monto original', () => {
  const html = generateStatementHtml(trip, [nationalExpense, internationalExpense], []);
  expect(html).toContain('170.00 PEN = 44.97 USD (T/C 3.7800)');
  expect(html).toContain('<td class="col-importe">312.99</td>');
  expect(html).toContain('<td>362.99</td>');
  expect(html).toContain('44.97 USD');
  expect(html).toContain('<td class="col-doc">0003431</td>');
  expect(html).toContain('<td class="col-doc doc-sistema">000013</td>');
  expect(html).toContain('N° DOCUMENTO en lila');
});

// Sin fondo en USD el gasto internacional sale del fondo en Bs; con fondo en USD sale de ese fondo
test('descuenta cada gasto internacional del fondo que corresponde', () => {
  const onlyBs = summarizeStatement(trip, [nationalExpense, internationalExpense]).balanceRows;
  expect(onlyBs[1]).toEqual(['Total Gastado', 362.99, 0]);
  expect(onlyBs[2]).toEqual(['Saldo en mi poder', 637.01, 0]);
  const withUsd = summarizeStatement({...trip, monto_asignado_usd: '100'}, [nationalExpense, internationalExpense]).balanceRows;
  expect(withUsd[1]).toEqual(['Total Gastado', 50, 44.97]);
  expect(withUsd[2]).toEqual(['Saldo en mi poder', 950, 55.03]);
});

// Un gasto antiguo sin tipo de cambio a Bs queda marcado y en USD
test('marca los gastos antiguos sin tipo de cambio a Bs', () => {
  const oldExpense = {...internationalExpense, tipo_cambio_bs: null, monto_total: '40.00', Gasto_Tramo_Moneda: [{moneda: 'PEN', monto_origen: '150', monto_usd: '40'}]};
  expect(originalAmountLinesOf(oldExpense)).toEqual(['150.00 PEN = 40.00 USD', 'Sin T/C a Bs']);
  expect(summarizeStatement(trip, [oldExpense]).balanceRows[1]).toEqual(['Total Gastado', 0, 40]);
});
