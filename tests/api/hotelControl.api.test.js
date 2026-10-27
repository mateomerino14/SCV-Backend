const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(60000);

let employee;
let tripId;
let categories;

// Viaje nacional con fondos para registrar gastos
beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  const supervisor = api(await login('maria.supervisora'));
  const approver = api(await login('pedro.aprobador'));
  const treasurer = api(await login('tesoro.prueba'));
  const created = await employee.post('/trip', {
    motivo: 'Viaje para control de hoteles', origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
    tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 900,
  });
  tripId = created.body.id_viaje;
  await employee.put(`/trip/${tripId}/submit-review`);
  await supervisor.post(`/review/trip-review/${tripId}/take`);
  await supervisor.post(`/review/trip-review/${tripId}/approve`);
  await approver.post(`/approver/trip/${tripId}/approve`);
  await treasurer.post(`/treasurer/${tripId}/approve`);
  categories = (await employee.get('/expense-category')).body;
});

// Busca el id de una categoria por el inicio de su nombre
const categoryId = (prefix) => categories.find((category) => category.nombre.startsWith(prefix)).id_categoria;

// Al cambiar un gasto a Hoteles sale del control diario y pasa al control contra el total del viaje
test('un gasto que cambia a Hoteles deja el control diario y pasa al total del viaje', async () => {
  const day = boliviaDate();
  const registered = await employee.postForm('/expense/register', {
    id_viaje: tripId, monto_total: 500, fecha_gasto: day, tipo: 'S', descripcion: 'Alojamiento', id_categoria_gasto: categoryId('626040'), es_gasto_internacional: false,
  });
  expect(registered.status).toBe(200);
  const expenseId = registered.body.gasto.id_gasto;
  let detail = (await employee.get(`/trip/${tripId}`)).body;
  expect(detail.desgloseDiario.find((item) => item.fecha === day)).toMatchObject({montoBs: 500, excedeBs: true});
  expect(detail.hotelAcumulado).toBe(0);

  const updated = await employee.putForm(`/expense/${expenseId}/update`, {
    id_viaje: tripId, monto_total: 500, fecha_gasto: day, tipo: 'S', descripcion: 'Alojamiento', id_categoria_gasto: categoryId('626030'), es_gasto_internacional: false,
  });
  expect(updated.status).toBe(200);
  detail = (await employee.get(`/trip/${tripId}`)).body;
  expect(detail.desgloseDiario.find((item) => item.fecha === day)).toBeUndefined();
  expect(detail.diasExcedidos).toHaveLength(0);
  expect(detail.hotelAcumulado).toBe(500);
  expect(detail.excedeHoteles).toBe(false);
});
