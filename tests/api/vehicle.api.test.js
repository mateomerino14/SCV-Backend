const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(60000);

let admin;
let employee;
let supervisor;
let vehicleId;
const plate = `T${Date.now() % 1000000}-ZZ`;

// Datos de un viaje nacional en el vehiculo de la empresa
const vehicleTrip = (overrides = {}) => ({
  motivo: 'Visita en vehículo de la empresa', origen: 'Cochabamba', destino: 'Oruro', fecha_inicio: boliviaDate(5), fecha_fin: boliviaDate(6),
  tipo: 'Nacional', transporte: 'Vehículo de Empresa', id_vehiculo: vehicleId, monto_asignado: 1100, monto_combustible: 500, gestion_hospedaje: 'Empresa', ...overrides,
});

beforeAll(async () => {
  admin = api(await login('admin.prueba'));
  employee = api(await login('juan.empleado'));
  supervisor = api(await login('maria.supervisora'));
  const created = await admin.post('/vehicle', {placa: ` ${plate.toLowerCase()} `, descripcion: 'Camioneta de prueba'});
  vehicleId = created.body.id_vehiculo;
});

// El administrador registra vehiculos con la placa normalizada y sin repetirla
test('registra un vehículo y no repite la placa', async () => {
  const list = await admin.get('/vehicle');
  expect(list.body.find((vehicle) => vehicle.id_vehiculo === vehicleId).placa).toBe(plate);
  const duplicate = await admin.post('/vehicle', {placa: plate});
  expect(duplicate.status).toBe(400);
  const forbidden = await employee.post('/vehicle', {placa: '1111-AAA'});
  expect(forbidden.status).toBe(403);
});

// El viaje guarda el vehiculo, su placa, el combustible y quien gestiona el hospedaje
test('crea el viaje con vehículo, combustible y hospedaje', async () => {
  const response = await employee.post('/trip', vehicleTrip());
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({id_vehiculo: vehicleId, placa_vehiculo: plate, gestion_hospedaje: 'Empresa'});
  expect(parseFloat(response.body.monto_combustible)).toBe(500);
  const withoutVehicle = await employee.post('/trip', vehicleTrip({transporte: 'Terrestre'}));
  expect(withoutVehicle.body.id_vehiculo).toBeNull();
  expect(parseFloat(withoutVehicle.body.monto_combustible)).toBe(0);
  const badLodging = await employee.post('/trip', vehicleTrip({gestion_hospedaje: 'Hotel'}));
  expect(badLodging.status).toBe(400);
});

// Un vehiculo enviado a revision deja de ofrecerse hasta que el empleado termina el viaje
test('ocupa el vehículo mientras el viaje está activo', async () => {
  const first = await employee.post('/trip', vehicleTrip());
  const second = await employee.post('/trip', vehicleTrip());
  expect((await employee.put(`/trip/${first.body.id_viaje}/submit-review`)).status).toBe(200);
  const available = await employee.get('/vehicle/available');
  expect(available.body.some((vehicle) => vehicle.id_vehiculo === vehicleId)).toBe(false);
  const editingFirst = await employee.get(`/vehicle/available?viaje=${first.body.id_viaje}`);
  expect(editingFirst.body.some((vehicle) => vehicle.id_vehiculo === vehicleId)).toBe(true);
  const blocked = await employee.put(`/trip/${second.body.id_viaje}/submit-review`);
  expect(blocked.status).toBe(409);
  const busyCreate = await employee.post('/trip', vehicleTrip());
  expect(busyCreate.status).toBe(400);
  const suspend = await admin.patch(`/vehicle/${vehicleId}/suspend`);
  expect(suspend.status).toBe(400);
  await supervisor.post(`/review/trip-review/${first.body.id_viaje}/take`);
  await supervisor.post(`/review/trip-review/${first.body.id_viaje}/comment`, {descripcion: 'Cambia las fechas del viaje'});
  expect((await supervisor.post(`/review/trip-review/${first.body.id_viaje}/reject`)).status).toBe(200);
  const released = await employee.get('/vehicle/available');
  expect(released.body.some((vehicle) => vehicle.id_vehiculo === vehicleId)).toBe(true);
});

// El memorandum autoriza el viaje sin el saludo al gerente e indica el hospedaje y el combustible
test('el memorándum autoriza el viaje con sus datos', () => {
  const {generateMemoHtml} = require('../../src/services/approval/approvalMemoService');
  const html = generateMemoHtml({...vehicleTrip(), placa_vehiculo: '9999-ZZZ', fecha_inicio: '2026-11-03', fecha_fin: '2026-11-06', Usuario: {nombre: 'Juan', apellido_paterno: 'Empleado', Cargo: {nombre: 'Analista'}}}, {nombre: 'Pedro', apellido_paterno: 'Aprobador'}, 'VIA-3/2026');
  expect(html).toContain('Se autoriza el viaje de <strong>Juan Empleado</strong>');
  expect(html).toContain('La empresa reserva el hospedaje');
  expect(html).toContain('Bs 500,00 para combustible');
  expect(html).toContain('(4 días)');
  expect(html).not.toContain('Señor Gerente');
  expect(html).toContain('data:image/jpeg;base64,');
});
