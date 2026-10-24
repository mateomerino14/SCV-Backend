const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(60000);

let employee;
let tripId;
let categoryId;

// Viaje nacional aprobado con fondos para registrar gastos sin factura con respaldos
beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  const supervisor = api(await login('maria.supervisora'));
  const approver = api(await login('pedro.aprobador'));
  const treasurer = api(await login('tesoro.prueba'));
  const created = await employee.post('/trip', {
    motivo: 'Viaje para respaldos de gastos', origen: 'La Paz', destino: 'Sucre', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
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

// Datos de un gasto sin factura de prueba
const expenseData = () => ({
  id_viaje: tripId, monto_total: 50, fecha_gasto: boliviaDate(), tipo: 'C', descripcion: 'Compra con cambio de moneda', id_categoria_gasto: categoryId, es_gasto_internacional: false,
});

// El gasto sin factura guarda el comprobante y hasta 2 respaldos, y los conserva o reemplaza al editar
test('guarda hasta 2 respaldos y permite conservarlos o cambiarlos al editar', async () => {
  const registered = await employee.postForm('/expense/register', expenseData(), ['imagen', 'respaldos', 'respaldos']);
  expect(registered.status).toBe(200);
  const expenseId = registered.body.gasto.id_gasto;
  let detail = (await employee.get(`/expense/${expenseId}/detail`)).body;
  expect(detail.Imagen.url_archivo).toBeTruthy();
  expect(detail.Imagen_Respaldo).toHaveLength(2);

  const kept = detail.Imagen_Respaldo[0].url_archivo;
  const updated = await employee.putForm(`/expense/${expenseId}/update`, {...expenseData(), mantener_imagen: true, respaldos_conservados: [kept]}, ['respaldos']);
  expect(updated.status).toBe(200);
  detail = (await employee.get(`/expense/${expenseId}/detail`)).body;
  expect(detail.Imagen_Respaldo).toHaveLength(2);
  expect(detail.Imagen_Respaldo.map((backup) => backup.url_archivo)).toContain(kept);

  const tooMany = await employee.putForm(`/expense/${expenseId}/update`, {...expenseData(), mantener_imagen: true, respaldos_conservados: detail.Imagen_Respaldo.map((backup) => backup.url_archivo)}, ['respaldos']);
  expect(tooMany.status).toBe(400);
  expect(tooMany.body.error).toMatch(/2 respaldos/);

  const cleared = await employee.putForm(`/expense/${expenseId}/update`, {...expenseData(), mantener_imagen: true, respaldos_conservados: []});
  expect(cleared.status).toBe(200);
  detail = (await employee.get(`/expense/${expenseId}/detail`)).body;
  expect(detail.Imagen_Respaldo).toHaveLength(0);
  expect(detail.Imagen.url_archivo).toBeTruthy();
});

// Mas de 2 respaldos al registrar se rechaza antes de guardar nada
test('rechaza un gasto con más de 2 respaldos', async () => {
  const response = await employee.postForm('/expense/register', expenseData(), ['imagen', 'respaldos', 'respaldos', 'respaldos']);
  expect(response.status).toBe(400);
});
