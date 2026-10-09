const {login, api, boliviaDate} = require('./helpers');

const tripData = (overrides = {}) => ({
  motivo: 'Prueba de tope',
  origen: 'La Paz',
  destino: 'Santa Cruz',
  fecha_inicio: boliviaDate(10),
  fecha_fin: boliviaDate(12),
  tipo: 'Nacional',
  transporte: 'Aéreo',
  ...overrides,
});

let employee;
let dailyRate;
let dailyRateUsd;

beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  const me = await employee.get('/user/me');
  dailyRate = parseFloat(me.body.Cargo.monto_diario);
  dailyRateUsd = parseFloat(me.body.Cargo.monto_diario_usd);
});

// El monto solicitado no puede superar dias por tarifa mas hospedaje
test('rechaza un monto solicitado mayor al tope', async () => {
  const limit = 3 * dailyRate + 200;
  const response = await employee.post('/trip', tripData({monto_solicitado: limit + 1, hospedaje_estimado: 200}));
  expect(response.status).toBe(400);
  expect(response.body.error).toContain(`no puede superar ${limit.toFixed(2)} Bs`);
});

// Un monto dentro del tope crea el viaje y lo deja como monto asignado inicial
test('crea un viaje nacional con el monto solicitado', async () => {
  const response = await employee.post('/trip', tripData({monto_solicitado: 3 * dailyRate, hospedaje_estimado: 0}));
  expect(response.status).toBe(200);
  expect(parseFloat(response.body.monto_solicitado)).toBe(3 * dailyRate);
  expect(parseFloat(response.body.monto_asignado)).toBe(3 * dailyRate);
  expect(parseFloat(response.body.monto_solicitado_usd)).toBe(0);
});

// En un viaje internacional se controla tambien el tope en dolares
test('controla el tope en dolares de un viaje internacional', async () => {
  const data = tripData({tipo: 'Internacional', destino: 'Lima', monto_solicitado: 0, monto_solicitado_usd: 3 * dailyRateUsd + 50, hospedaje_estimado_usd: 40});
  const response = await employee.post('/trip', data);
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('USD');
});

// El borrador se puede reeditar con un nuevo monto dentro del tope
test('reedita un borrador con otro monto', async () => {
  const created = await employee.post('/trip', tripData({monto_solicitado: dailyRate, hospedaje_estimado: 100}));
  const edited = await employee.put(`/trip/${created.body.id_viaje}/edit`, tripData({monto_solicitado: dailyRate + 100, hospedaje_estimado: 100}));
  expect(edited.status).toBe(200);
  const detail = await employee.get(`/trip/${created.body.id_viaje}`);
  expect(parseFloat(detail.body.viaje.monto_solicitado)).toBe(dailyRate + 100);
});
