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
