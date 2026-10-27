const supabase = require('../../src/config/supabase');
const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(90000);

const listOf = (body) => {
  if (Array.isArray(body)) {
    return body;
  }
  return Object.values(body || {}).find((value) => Array.isArray(value)) || [];
};

// Crea un viaje nacional de dos dias para el usuario y devuelve su id
const createTrip = async (client, motivo) => {
  const created = await client.post('/trip', {
    motivo, origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 600,
  });
  return created.body.id_viaje;
};

// Ids de los viajes que devuelve una bandeja de revision
const tripIdsOf = async (client, path) => listOf((await client.get(path)).body).map((trip) => trip.id_viaje);

// Cada viaje enviado a revision llega al jefe directo de quien viaja, y solo a el
test('envía cada viaje al jefe directo de quien viaja', async () => {
  const maria = api(await login('maria.supervisora'));
  const jorge = api(await login('jorge.supervisor'));
  const juanTrip = await createTrip(api(await login('juan.empleado')), 'Viaje de Juan para su jefa');
  const carlosTrip = await createTrip(api(await login('carlos.empleado')), 'Viaje de Carlos para su jefe');
  await api(await login('juan.empleado')).put(`/trip/${juanTrip}/submit-review`);
  await api(await login('carlos.empleado')).put(`/trip/${carlosTrip}/submit-review`);
  const mariaTrips = await tripIdsOf(maria, '/review/trip-review/mine');
  const jorgeTrips = await tripIdsOf(jorge, '/review/trip-review/mine');
  expect(mariaTrips).toContain(juanTrip);
  expect(mariaTrips).not.toContain(carlosTrip);
  expect(jorgeTrips).toContain(carlosTrip);
  expect(jorgeTrips).not.toContain(juanTrip);
});

// Sin jefe directo el viaje queda sin asignar y lo puede tomar cualquier supervisor
test('deja el viaje de quien no tiene jefe directo para que lo tome un supervisor', async () => {
  const sofia = api(await login('sofia.sincobertura'));
  const tripId = await createTrip(sofia, 'Viaje sin jefe directo');
  const submitted = await sofia.put(`/trip/${tripId}/submit-review`);
  expect(submitted.status).toBe(200);
  const {data: trip} = await supabase.from('Viaje').select('id_supervisor_asignado').eq('id_viaje', tripId).single();
  expect(trip.id_supervisor_asignado).toBeNull();
  expect(await tripIdsOf(api(await login('maria.supervisora')), '/review/trip-review/pending')).toContain(tripId);
  expect(await tripIdsOf(api(await login('jorge.supervisor')), '/review/trip-review/pending')).toContain(tripId);
});

// El reemplazo aprobado rinde el viaje junto con el titular; nadie mas puede registrar gastos
test('deja rendir el viaje al reemplazo aprobado y al titular, y a nadie más', async () => {
  const owner = api(await login('juan.empleado'));
  const substitute = api(await login('ana.empleada'));
  const outsider = api(await login('carlos.empleado'));
  const reviewer = api(await login('lucia.revisora'));
  const tripId = await createTrip(owner, 'Viaje con reemplazo');
  await supabase.from('Viaje').update({estado: 'EN_CURSO', fue_iniciado: true}).eq('id_viaje', tripId);
  const {data: ana} = await supabase.from('Usuario').select('id_usuario').eq('email_corporativo', 'ana.empleada@maxam.com').single();
  const expense = {id_viaje: tripId, monto_total: 20, fecha_gasto: boliviaDate(), tipo: 'C', descripcion: 'Compra del viaje', id_categoria_gasto: 1, es_gasto_internacional: false};

  expect((await substitute.postForm('/expense/register', expense)).status).toBe(403);
  expect((await owner.post(`/substitution/trip/${tripId}/request`, {id_sustituto: ana.id_usuario})).status).toBe(200);
  const request = listOf((await reviewer.get('/substitution/pending')).body).find((item) => item.id_viaje === tripId);
  expect((await reviewer.post(`/substitution/${request.id_solicitud}/approve`)).status).toBe(200);

  expect((await substitute.postForm('/expense/register', {...expense, descripcion: 'Gasto del reemplazo'})).status).toBe(200);
  expect((await owner.postForm('/expense/register', {...expense, descripcion: 'Gasto del titular'})).status).toBe(200);
  const rejected = await outsider.postForm('/expense/register', expense);
  expect(rejected.status).toBe(403);
  expect(rejected.body.error).toBe('No tienes permiso sobre este viaje');
  expect(JSON.stringify((await substitute.get('/substitution/mine')).body)).toContain(`"id_viaje":${tripId}`);
  const detail = await substitute.get(`/trip/${tripId}`);
  expect(detail.status).toBe(200);
  expect(detail.body.viaje.Usuario.nombre).toBe('Juan');
});
