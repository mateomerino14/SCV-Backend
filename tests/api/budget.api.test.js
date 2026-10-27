const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(60000);

let employee;
let tripId;
let categoryId;

// Viaje nacional aprobado con fondos para registrar gastos sin factura
beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  const supervisor = api(await login('maria.supervisora'));
  const approver = api(await login('pedro.aprobador'));
  const treasurer = api(await login('tesoro.prueba'));
  const created = await employee.post('/trip', {
    motivo: 'Viaje para control de presupuesto', origen: 'La Paz', destino: 'Potosi', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
    tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 900,
  });
  tripId = created.body.id_viaje;
  await employee.put(`/trip/${tripId}/submit-review`);
  await supervisor.post(`/review/trip-review/${tripId}/take`);
  await supervisor.post(`/review/trip-review/${tripId}/approve`);
  await approver.post(`/approver/trip/${tripId}/approve`);
  await treasurer.post(`/treasurer/${tripId}/approve`);
  const categories = (await employee.get('/expense-category')).body;
  categoryId = categories.find((category) => category.nombre.startsWith('626040')).id_categoria;
});

// Sin factura el presupuesto descuenta lo pagado y no la base incrementada
test('un gasto sin factura descuenta del presupuesto el monto pagado', async () => {
  const registered = await employee.postForm('/expense/register', {
    id_viaje: tripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Servicio sin factura', id_categoria_gasto: categoryId, es_gasto_internacional: false,
  });
  expect(registered.status).toBe(200);
  const detail = (await employee.get(`/trip/${tripId}`)).body;
  expect(detail.gastoAcumulado).toBe(40);
  expect(detail.desgloseDiario.find((item) => item.fecha === boliviaDate()).montoBs).toBe(40);
});
