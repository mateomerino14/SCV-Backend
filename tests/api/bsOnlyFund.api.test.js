const supabase = require('../../src/config/supabase');
const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(90000);

let employee;
let treasurer;
let tripId;

// Viaje internacional que Tesoreria entrega todo en Bs, anotando el tipo de cambio con que convirtio el fondo
beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  treasurer = api(await login('tesoro.prueba'));
  const supervisor = api(await login('maria.supervisora'));
  const created = await employee.post('/trip', {
    motivo: 'Feria en Lima con fondo en Bs', origen: 'La Paz', destino: 'Lima', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
    tipo: 'Internacional', transporte: 'Aéreo', monto_asignado: 600, monto_asignado_usd: 100,
  });
  tripId = created.body.id_viaje;
  await employee.put(`/trip/${tripId}/submit-review`);
  await supervisor.post(`/review/trip-review/${tripId}/take`);
  await supervisor.post(`/review/trip-review/${tripId}/approve`);
  await api(await login('pedro.aprobador')).post(`/approver/trip/${tripId}/approve`);
});

// Tesoreria anota el tipo de cambio del fondo solo cuando lo entrega en Bs
test('tesorería guarda el tipo de cambio del fondo entregado solo en Bs', async () => {
  expect((await treasurer.put(`/treasurer/${tripId}/amounts`, {monto_asignado: 1300, monto_asignado_usd: 0, tipo_cambio_fondo: -1})).status).toBe(400);
  expect((await treasurer.put(`/treasurer/${tripId}/amounts`, {monto_asignado: 1300, monto_asignado_usd: 0, tipo_cambio_fondo: 7})).status).toBe(200);
  const {data: trip} = await supabase.from('Viaje').select('tipo_cambio_fondo').eq('id_viaje', tripId).single();
  expect(parseFloat(trip.tipo_cambio_fondo)).toBe(7);
  expect((await treasurer.post(`/treasurer/${tripId}/approve`)).status).toBe(200);
});

// Sin fondo en USD, un gasto rendido en USD tambien necesita su tipo de cambio a Bs, y el dia intermedio se controla con el del fondo
test('sin fondo en USD el gasto en USD pide el tipo de cambio a Bs y el día intermedio usa el del fondo', async () => {
  const base = {id_viaje: tripId, monto_moneda_origen: 150, moneda: 'PEN', moneda_rendicion: 'USD', tipo_cambio: 3.75, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Almuerzo en Lima', id_categoria_gasto: 1, es_gasto_internacional: true};
  expect((await employee.postForm('/expense/register', base)).status).toBe(400);
  expect((await employee.postForm('/expense/register', {...base, tipo_cambio_bs: 6.9})).status).toBe(200);
  const detail = (await employee.get(`/trip/${tripId}`)).body;
  expect(detail.gastoAcumulado).toBe(276);
  expect(detail.gastoAcumuladoUsd).toBe(0);
  const today = detail.desgloseDiario.find((day) => day.fecha === boliviaDate());
  expect(today).toMatchObject({montoBs: 276, tipoCambio: 7});
});
