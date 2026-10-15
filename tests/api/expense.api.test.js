const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(60000);

let employee;
let tripId;

beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  const supervisor = api(await login('maria.supervisora'));
  const approver = api(await login('pedro.aprobador'));
  const treasurer = api(await login('tesoro.prueba'));
  const created = await employee.post('/trip', {
    motivo: 'Viaje internacional de prueba',
    origen: 'La Paz',
    destino: 'Lima',
    fecha_inicio: boliviaDate(-1),
    fecha_fin: boliviaDate(1),
    tipo: 'Internacional',
    transporte: 'Aéreo',
    monto_asignado: 600,
    monto_asignado_usd: 40,
  });
  tripId = created.body.id_viaje;
  await employee.put(`/trip/${tripId}/submit-review`);
  await supervisor.post(`/review/trip-review/${tripId}/take`);
  await supervisor.post(`/review/trip-review/${tripId}/approve`);
  await approver.post(`/approver/trip/${tripId}/approve`);
  await treasurer.post(`/treasurer/${tripId}/approve`);
});

// En un viaje internacional se puede gastar en bolivianos cualquier dia, tambien uno intermedio
test('acepta un gasto en bolivianos en un dia intermedio', async () => {
  const response = await employee.postForm('/expense/register', {
    id_viaje: tripId, monto_total: 50, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi al hotel', id_categoria_gasto: 1, es_gasto_internacional: false,
  });
  expect(response.status).toBe(200);
});

// El tipo de cambio de cada tramo es el que escribe el empleado
test('guarda el tipo de cambio escrito por el empleado', async () => {
  const response = await employee.postForm('/expense/register', {
    id_viaje: tripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi en Lima', id_categoria_gasto: 1, es_gasto_internacional: true,
    tramos: [{moneda: 'PEN', monto_origen: 150, tipo_cambio: 3.75}],
  });
  expect(response.status).toBe(200);
  const detail = await employee.get(`/expense/${response.body.gasto.id_gasto}/detail`);
  const segment = detail.body.Gasto_Tramo_Moneda?.[0] || detail.body.gasto?.Gasto_Tramo_Moneda?.[0];
  expect(parseFloat(segment.tipo_cambio)).toBe(3.75);
  expect(parseFloat(segment.monto_usd)).toBe(40);
});

// El recibo se guarda sin IVA y la cantidad del detalle admite decimales
test('guarda un recibo sin IVA con cantidad decimal', async () => {
  const response = await employee.postForm('/invoice/save', {
    id_viaje: tripId, proveedor: 'Surtidor de prueba', numero_factura: 'R-5334', nit: '1020304', fecha_emision: boliviaDate(), tipo_doc: 'R',
    monto: 199.49, iva: 0, monto_total: 199.49, id_categoria_gasto: 1, detalle: [{nombre_producto: 'Gasolina', cantidad: 53.34, precio: 3.74}],
  });
  expect(response.status).toBe(200);
  const expenseId = response.body.gasto?.id_gasto || response.body.id_gasto;
  const detail = await employee.get(`/expense/${expenseId}/detail`);
  const expense = detail.body.gasto || detail.body;
  expect(expense.tipo).toBe('R');
  expect(expense.Factura.Factura_Impuestos || []).toHaveLength(0);
  expect(parseFloat(expense.Factura.Detalle_Factura[0].cantidad)).toBe(53.34);
});

// Una cantidad con mas de 2 decimales se rechaza
test('rechaza una cantidad con más de 2 decimales', async () => {
  const response = await employee.postForm('/invoice/save', {
    id_viaje: tripId, proveedor: 'Surtidor de prueba', numero_factura: 'R-5335', fecha_emision: boliviaDate(), tipo_doc: 'R',
    monto: 10, iva: 0, monto_total: 10, id_categoria_gasto: 1, detalle: [{nombre_producto: 'Gasolina', cantidad: 2.345, precio: 4}],
  });
  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/2 decimales/);
});
