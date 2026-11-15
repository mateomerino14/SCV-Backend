const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(60000);

let admin;
let employee;
let originalTypeC;

// Datos de un viaje del empleado (cargo tipo A: Bs 230 en el pais, USD 230 clase 1 y USD 170 clase 2)
const tripData = (overrides = {}) => ({
  motivo: 'Viaje para probar la escala', origen: 'La Paz', destino: 'Lima', fecha_inicio: boliviaDate(10), fecha_fin: boliviaDate(13),
  tipo: 'Internacional', pais_destino: 'Perú', transporte: 'Aéreo', monto_asignado: 460, monto_asignado_usd: 340, ...overrides,
});

beforeAll(async () => {
  admin = api(await login('admin.prueba'));
  employee = api(await login('juan.empleado'));
  const scale = await admin.get('/travel-scale');
  originalTypeC = scale.body.find((row) => row.tipo === 'C');
});

afterAll(async () => {
  await admin.put('/travel-scale/C', {monto_interior: originalTypeC.monto_interior, monto_clase_1_usd: originalTypeC.monto_clase_1_usd, hospedaje: originalTypeC.hospedaje});
});

// La escala vigente tiene los tres tipos con las tarifas del reglamento
test('lista la escala de viáticos de C a A', async () => {
  const response = await employee.get('/travel-scale');
  expect(response.status).toBe(200);
  expect(response.body.map((row) => row.tipo)).toEqual(['C', 'B', 'A']);
  const typeA = response.body.find((row) => row.tipo === 'A');
  expect(parseFloat(typeA.monto_interior)).toBe(230);
  expect(parseFloat(typeA.monto_clase_1_usd)).toBe(230);
  expect(parseFloat(typeA.monto_clase_2_usd)).toBe(170);
});

// Solo el administrador cambia la escala y los montos deben ser validos
test('el administrador actualiza la escala con montos válidos', async () => {
  const forbidden = await employee.put('/travel-scale/C', {monto_interior: 1});
  expect(forbidden.status).toBe(403);
  const negative = await admin.put('/travel-scale/C', {monto_interior: -5});
  expect(negative.status).toBe(400);
  const wrongType = await admin.put('/travel-scale/Z', {monto_interior: 5});
  expect(wrongType.status).toBe(400);
  const updated = await admin.put('/travel-scale/C', {monto_interior: '470.5', hospedaje: 'Hasta 4 estrellas'});
  expect(updated.status).toBe(200);
  expect(parseFloat(updated.body.monto_interior)).toBe(470.5);
  expect(updated.body.hospedaje).toBe('Hasta 4 estrellas');
});

// El cargo necesita un tipo de la escala y solo guarda su nombre y su tipo
test('crea un cargo con su tipo de la escala', async () => {
  const name = `Cargo Escala ${Date.now()}`;
  const withoutType = await admin.post('/position', {nombre: name});
  expect(withoutType.status).toBe(400);
  const created = await admin.post('/position', {nombre: name, tipo_viatico: 'B', monto_diario: 999});
  expect(created.status).toBe(200);
  expect(created.body[0]).toMatchObject({nombre: name, tipo_viatico: 'B'});
  expect(created.body[0].monto_diario).toBeUndefined();
  const list = await admin.get('/position');
  const listed = list.body.find((position) => position.nombre === name);
  expect(parseFloat(listed.Escala_Viatico.monto_interior)).toBe(340);
  await admin.del(`/position/${created.body[0].id_cargo}`);
});

// El viaje internacional fija la tarifa en USD segun la clase del pais y el nacional solo la de Bs
test('fija las tarifas del viaje según el país de destino', async () => {
  const toPeru = await employee.post('/trip', tripData());
  expect(toPeru.status).toBe(200);
  expect(toPeru.body).toMatchObject({pais_destino: 'Perú', clase_pais: 2});
  expect(parseFloat(toPeru.body.tarifa_diaria)).toBe(230);
  expect(parseFloat(toPeru.body.tarifa_diaria_usd)).toBe(170);
  const toSpain = await employee.post('/trip', tripData({destino: 'Madrid', pais_destino: 'España'}));
  expect(toSpain.body).toMatchObject({clase_pais: 1});
  expect(parseFloat(toSpain.body.tarifa_diaria_usd)).toBe(230);
  const national = await employee.post('/trip', tripData({tipo: 'Nacional', destino: 'Sucre', pais_destino: 'Perú', monto_asignado_usd: 0}));
  expect(national.body).toMatchObject({pais_destino: null, clase_pais: null});
  expect(parseFloat(national.body.tarifa_diaria_usd)).toBe(0);
});

// Un viaje internacional sin pais de la lista no se guarda
test('pide el país de destino en un viaje internacional', async () => {
  const withoutCountry = await employee.post('/trip', tripData({pais_destino: undefined}));
  expect(withoutCountry.status).toBe(400);
  const unknownCountry = await employee.post('/trip', tripData({pais_destino: 'Atlántida'}));
  expect(unknownCountry.status).toBe(400);
  expect(unknownCountry.body.error).toMatch(/país de destino/);
});

// El perfil trae la escala del cargo para calcular el fondo al crear el viaje
test('el perfil incluye la escala del cargo', async () => {
  const me = await employee.get('/user/me');
  expect(me.body.Cargo.tipo_viatico).toBe('A');
  expect(parseFloat(me.body.Cargo.Escala_Viatico.monto_clase_2_usd)).toBe(170);
});
