const supabase = require('../../src/config/supabase');
const {login, api, boliviaDate, request, app} = require('./helpers');

jest.setTimeout(60000);

let owner;
let stranger;
let otherSupervisor;
let reviewTripId;
let activeTripId;
let expenseId;

// Viaje de prueba de Juan con las fechas indicadas
const tripData = (motivo) => ({
  motivo, origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 600,
});

beforeAll(async () => {
  owner = api(await login('juan.empleado'));
  stranger = api(await login('carlos.empleado'));
  otherSupervisor = api(await login('jorge.supervisor'));
  reviewTripId = (await owner.post('/trip', tripData('Viaje en revisión de Juan'))).body.id_viaje;
  await owner.put(`/trip/${reviewTripId}/submit-review`);
  activeTripId = (await owner.post('/trip', tripData('Viaje en curso de Juan'))).body.id_viaje;
  await supabase.from('Viaje').update({estado: 'EN_CURSO', fue_iniciado: true}).eq('id_viaje', activeTripId);
  const registered = await owner.postForm('/expense/register', {id_viaje: activeTripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi', id_categoria_gasto: 1, es_gasto_internacional: false});
  expenseId = registered.body.gasto.id_gasto;
});

// Sin sesion, o con un token alterado, ninguna ruta privada responde datos
test('sin sesión o con un token alterado no se entra a ninguna ruta privada', async () => {
  const privatePaths = [`/trip/${activeTripId}`, `/trip/${activeTripId}/firmas-planilla`, `/expense/${expenseId}/detail`, '/vehicle/available', '/user/me', '/approver/pending-trips'];
  for (const path of privatePaths) {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).set('authorization', 'Bearer token.alterado.123')).status).toBe(401);
  }
});

// Otro empleado no puede ver ni tocar el viaje ni los gastos de Juan aunque escriba la ruta a mano
test('otro empleado no ve ni modifica el viaje ni los gastos ajenos por ruta directa', async () => {
  const forbidden = [
    await stranger.get(`/trip/${activeTripId}`),
    await stranger.get(`/trip/${activeTripId}/firmas-planilla`),
    await stranger.get(`/trip/${activeTripId}/rendicion-pdf`),
    await stranger.put(`/trip/${activeTripId}/edit`, tripData('Cambio ajeno')),
    await stranger.put(`/trip/${activeTripId}/confirm-completion`, {justificaciones: []}),
    await stranger.get(`/expense/${expenseId}/detail`),
    await stranger.putForm(`/expense/${expenseId}/update`, {id_viaje: activeTripId, monto_total: 1, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Cambio ajeno', id_categoria_gasto: 1}),
    await stranger.del(`/expense/${expenseId}`),
    await stranger.post(`/expense/${expenseId}/receipt`),
    await stranger.postForm('/expense/register', {id_viaje: activeTripId, monto_total: 10, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Gasto ajeno', id_categoria_gasto: 1}),
    await stranger.post(`/substitution/trip/${activeTripId}/request`, {id_sustituto: 1}),
    await stranger.get(`/substitution/trip/${activeTripId}/status`),
    await stranger.get(`/deadline-authorization/trip/${activeTripId}/status`),
  ];
  forbidden.forEach((response) => expect([403, 404]).toContain(response.status));
  expect((await stranger.put(`/trip/${reviewTripId}/submit-review`)).status).toBe(403);
  const {data: expense} = await supabase.from('Gasto').select('monto_total').eq('id_gasto', expenseId).single();
  expect(parseFloat(expense.monto_total)).toBe(40);
});

// Un empleado no entra a las bandejas ni a la administracion de otros roles
test('un empleado no entra a las rutas de otros roles', async () => {
  const roleOnly = [
    await stranger.get('/approver/pending-trips'),
    await stranger.get(`/approver/trip/${reviewTripId}`),
    await stranger.post(`/approver/trip/${reviewTripId}/approve`),
    await stranger.get('/reviewer/pending'),
    await stranger.get('/treasurer/pending-trips'),
    await stranger.get('/review/trip-review/pending'),
    await stranger.get(`/review/trip-review/${reviewTripId}`),
    await stranger.get('/vehicle'),
    await stranger.post('/vehicle', {placa: 'X-1'}),
    await stranger.get('/user/all'),
    await stranger.get('/admin/dashboard'),
    await stranger.get('/substitution/pending'),
    await stranger.get('/deadline-authorization/pending'),
  ];
  roleOnly.forEach((response) => expect(response.status).toBe(403));
});

// Un supervisor de otra seccion no abre el viaje que revisa el jefe de Juan
test('un supervisor de otra sección no abre un viaje que no le corresponde', async () => {
  expect((await otherSupervisor.get(`/review/trip-review/${reviewTripId}`)).status).toBe(403);
  expect((await otherSupervisor.post(`/review/trip-review/${reviewTripId}/approve`)).status).toBe(403);
});
