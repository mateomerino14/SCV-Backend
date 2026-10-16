const {login, api, boliviaDate} = require('./helpers');

const tripData = (overrides = {}) => ({
  motivo: 'Prueba de viaje',
  origen: 'La Paz',
  destino: 'Santa Cruz',
  fecha_inicio: boliviaDate(10),
  fecha_fin: boliviaDate(12),
  tipo: 'Nacional',
  transporte: 'Aéreo',
  monto_asignado: 900,
  ...overrides,
});

let employee;

beforeAll(async () => {
  employee = api(await login('juan.empleado'));
});

// Crea un viaje con el monto calculado por el cliente a partir de las tarifas del cargo
test('crea un viaje nacional con su monto', async () => {
  const response = await employee.post('/trip', tripData());
  expect(response.status).toBe(200);
  expect(parseFloat(response.body.monto_asignado)).toBe(900);
});

// Un monto negativo se rechaza
test('rechaza un monto negativo', async () => {
  const response = await employee.post('/trip', tripData({monto_asignado: -1}));
  expect(response.status).toBe(400);
});

// El borrador se puede reeditar con otro monto
test('reedita un borrador con otro monto', async () => {
  const created = await employee.post('/trip', tripData());
  const edited = await employee.put(`/trip/${created.body.id_viaje}/edit`, tripData({monto_asignado: 1000}));
  expect(edited.status).toBe(200);
  const detail = await employee.get(`/trip/${created.body.id_viaje}`);
  expect(parseFloat(detail.body.viaje.monto_asignado)).toBe(1000);
});

// El motivo admite hasta 500 caracteres
test('acepta un motivo de 500 caracteres y rechaza uno más largo', async () => {
  const employee = api(await login('juan.empleado'));
  const accepted = await employee.post('/trip', tripData({motivo: 'm'.repeat(500)}));
  expect(accepted.status).toBe(200);
  const rejected = await employee.post('/trip', tripData({motivo: 'm'.repeat(501)}));
  expect(rejected.status).toBe(400);
});
