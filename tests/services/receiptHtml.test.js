jest.mock('../../src/config/supabase', () => ({}));
const {generateIndividualReceiptHtml} = require('../../src/services/expense/receiptService');

const purchase = {
  tipo: 'C', monto_total: 65, fecha_gasto: '2026-07-27', descripcion: 'Refrigerio durante el viaje', es_gasto_internacional: false,
  numero_recibo: '0003431', Gasto_Subitem: [], Gasto_Tramo_Moneda: [],
};
const employee = {nombre: 'Guido', apellido_paterno: 'Vitalo', carnet_identidad: '6400209', Seccion: {nombre: 'Produccion'}};

// Como el recibo en papel: total importe 70.65, retenciones 3.53 y 2.12, y "Son" lo que se paga (65)
test('el recibo muestra el total importe, las retenciones y en letras el importe a cancelar', () => {
  const html = generateIndividualReceiptHtml(purchase, employee, '000058', 'VIA-209/2026', 'Viaje a Santa Cruz', null);
  expect(html).toContain('70.65');
  expect(html).toContain('3.53');
  expect(html).toContain('2.12');
  expect(html).toMatch(/SESENTA Y CINCO 00\/100/);
});

// Si el empleado anoto el numero del recibo en papel, el recibo del sistema lo menciona
test('menciona el recibo original en papel solo si tiene número', () => {
  expect(generateIndividualReceiptHtml(purchase, employee, '000058', 'VIA-209/2026', 'Viaje', null)).toContain('Recibo original Nº 0003431');
  expect(generateIndividualReceiptHtml({...purchase, numero_recibo: null}, employee, '000058', 'VIA-209/2026', 'Viaje', null)).not.toContain('Recibo original');
});
