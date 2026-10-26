const {login, api, boliviaDate} = require('./helpers');
const {getStoragePath} = require('../../src/services/shared/storageService');

// Rutas que el backend pidio borrar del almacenamiento (las anota el proxy de pruebas)
const removedFiles = async () => (await fetch(`${process.env.SUPABASE_URL}/__storage/removed`)).json();

jest.setTimeout(60000);

let employee;
let tripId;
let categoryId;

// Viaje internacional aprobado con fondos para registrar gastos sin factura con respaldos
beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  const supervisor = api(await login('maria.supervisora'));
  const approver = api(await login('pedro.aprobador'));
  const treasurer = api(await login('tesoro.prueba'));
  const created = await employee.post('/trip', {
    motivo: 'Viaje para respaldos de gastos', origen: 'La Paz', destino: 'Lima', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
    tipo: 'Internacional', transporte: 'Aéreo', monto_asignado: 900, monto_asignado_usd: 200,
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
  id_viaje: tripId, monto_total: 50, fecha_gasto: boliviaDate(), tipo: 'C', descripcion: 'Compra con cambio de moneda', id_categoria_gasto: categoryId, es_gasto_internacional: true, tipo_cambio_bs: 6.96,
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
  const dropped = detail.Imagen_Respaldo[1].url_archivo;
  const updated = await employee.putForm(`/expense/${expenseId}/update`, {...expenseData(), mantener_imagen: true, respaldos_conservados: [kept]}, ['respaldos']);
  expect(updated.status).toBe(200);
  detail = (await employee.get(`/expense/${expenseId}/detail`)).body;
  expect(detail.Imagen_Respaldo).toHaveLength(2);
  expect(detail.Imagen_Respaldo.map((backup) => backup.url_archivo)).toContain(kept);
  expect(await removedFiles()).toContain(getStoragePath(dropped));

  const tooMany = await employee.putForm(`/expense/${expenseId}/update`, {...expenseData(), mantener_imagen: true, respaldos_conservados: detail.Imagen_Respaldo.map((backup) => backup.url_archivo)}, ['respaldos']);
  expect(tooMany.status).toBe(400);
  expect(tooMany.body.error).toMatch(/2 respaldos/);

  const cleared = await employee.putForm(`/expense/${expenseId}/update`, {...expenseData(), mantener_imagen: true, respaldos_conservados: []});
  expect(cleared.status).toBe(200);
  detail = (await employee.get(`/expense/${expenseId}/detail`)).body;
  expect(detail.Imagen_Respaldo).toHaveLength(0);
  expect(detail.Imagen.url_archivo).toBeTruthy();
});

// El numero impreso del recibo en papel se guarda para el Excel de Oracle
test('guarda el número del recibo en papel', async () => {
  const registered = await employee.postForm('/expense/register', {...expenseData(), numero_recibo: ' 0003431 '}, ['imagen']);
  expect(registered.status).toBe(200);
  const detail = (await employee.get(`/expense/${registered.body.gasto.id_gasto}/detail`)).body;
  expect(detail.numero_recibo).toBe('0003431');
});

// Mas de 2 respaldos al registrar se rechaza antes de guardar nada
test('rechaza un gasto con más de 2 respaldos', async () => {
  const response = await employee.postForm('/expense/register', expenseData(), ['imagen', 'respaldos', 'respaldos', 'respaldos']);
  expect(response.status).toBe(400);
});

// Al eliminar un gasto se borran del almacenamiento su comprobante y sus respaldos
test('borra los archivos del gasto al eliminarlo', async () => {
  const registered = await employee.postForm('/expense/register', expenseData(), ['imagen', 'respaldos']);
  const expenseId = registered.body.gasto.id_gasto;
  const detail = (await employee.get(`/expense/${expenseId}/detail`)).body;
  const files = [detail.Imagen.url_archivo, detail.Imagen_Respaldo[0].url_archivo].map(getStoragePath);
  expect((await employee.del(`/expense/${expenseId}`)).status).toBe(200);
  expect(await removedFiles()).toEqual(expect.arrayContaining(files));
});

// Un gasto en bolivianos no lleva respaldos, ni en un viaje internacional ni en uno nacional
test('rechaza respaldos en los gastos en bolivianos', async () => {
  const nationalExpense = {...expenseData(), es_gasto_internacional: false};
  const rejected = await employee.postForm('/expense/register', nationalExpense, ['imagen', 'respaldos']);
  expect(rejected.status).toBe(400);
  expect(rejected.body.error).toMatch(/gastos internacionales/);
  const accepted = await employee.postForm('/expense/register', nationalExpense, ['imagen']);
  expect(accepted.status).toBe(200);
  const edited = await employee.putForm(`/expense/${accepted.body.gasto.id_gasto}/update`, {...nationalExpense, mantener_imagen: true}, ['respaldos']);
  expect(edited.status).toBe(400);
});

// En un viaje nacional no se adjuntan respaldos: son para el comprobante del cambio de moneda
test('rechaza respaldos en un viaje nacional', async () => {
  const created = await employee.post('/trip', {
    motivo: 'Viaje nacional sin respaldos', origen: 'La Paz', destino: 'Sucre', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
    tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 900,
  });
  const nationalTrip = created.body.id_viaje;
  const supervisor = api(await login('maria.supervisora'));
  await employee.put(`/trip/${nationalTrip}/submit-review`);
  await supervisor.post(`/review/trip-review/${nationalTrip}/take`);
  await supervisor.post(`/review/trip-review/${nationalTrip}/approve`);
  await api(await login('pedro.aprobador')).post(`/approver/trip/${nationalTrip}/approve`);
  await api(await login('tesoro.prueba')).post(`/treasurer/${nationalTrip}/approve`);
  const rejected = await employee.postForm('/expense/register', {...expenseData(), id_viaje: nationalTrip, es_gasto_internacional: false}, ['imagen', 'respaldos']);
  expect(rejected.status).toBe(400);
  expect(rejected.body.error).toMatch(/gastos internacionales/);
  const accepted = await employee.postForm('/expense/register', {...expenseData(), id_viaje: nationalTrip, es_gasto_internacional: false}, ['imagen']);
  expect(accepted.status).toBe(200);
  const edited = await employee.putForm(`/expense/${accepted.body.gasto.id_gasto}/update`, {...expenseData(), id_viaje: nationalTrip, es_gasto_internacional: false, mantener_imagen: true}, ['respaldos']);
  expect(edited.status).toBe(400);
});
