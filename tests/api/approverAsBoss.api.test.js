const supabase = require('../../src/config/supabase');
const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(90000);

const employeeEmail = 'sofia.sincobertura@maxam.com';
const approverEmail = 'pedro.aprobador@maxam.com';

const idOf = async (email) => (await supabase.from('Usuario').select('id_usuario').eq('email_corporativo', email).single()).data.id_usuario;

const tripOf = async (tripId) => (await supabase.from('Viaje').select('estado, id_supervisor_asignado, id_aprobador_asignado, id_revisor_asignado').eq('id_viaje', tripId).single()).data;

// Crea y envia a revision un viaje nacional de la empleada
const submitTrip = async (client, motivo) => {
  const created = await client.post('/trip', {
    motivo, origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 600,
  });
  await client.put(`/trip/${created.body.id_viaje}/submit-review`);
  return created.body.id_viaje;
};

let employeeId;
let approverId;

beforeAll(async () => {
  employeeId = await idOf(employeeEmail);
  approverId = await idOf(approverEmail);
  await supabase.from('Usuario').update({id_jefe_directo: approverId}).eq('id_usuario', employeeId);
});

afterAll(async () => {
  await supabase.from('Usuario').update({id_jefe_directo: null}).eq('id_usuario', employeeId);
});

// Si el jefe directo es el aprobador, revisa el viaje como supervisor y su aprobacion vale tambien como aprobador
test('el aprobador revisa el viaje de su subordinada y no lo aprueba dos veces', async () => {
  const employee = api(await login('sofia.sincobertura'));
  const approver = api(await login('pedro.aprobador'));
  const tripId = await submitTrip(employee, 'Viaje con el gerente como jefe');
  expect((await tripOf(tripId)).id_supervisor_asignado).toBe(approverId);
  const mine = await approver.get('/review/trip-review/mine');
  expect(mine.status).toBe(200);
  expect(JSON.stringify(mine.body)).toContain(`"id_viaje":${tripId}`);
  expect((await approver.get('/review/trip-review/pending')).status).toBe(403);
  const approved = await approver.post(`/review/trip-review/${tripId}/approve`);
  expect(approved.status).toBe(200);
  const trip = await tripOf(tripId);
  expect(trip.estado).toBe('EN_REVISION_TESORERO');
  expect(trip.id_aprobador_asignado).toBe(approverId);
});

// La rendicion la revisa el aprobador como jefe directo y pasa al revisor, sin repetir la revision por alcohol
test('la rendición pasa del aprobador como jefe directo al revisor, aunque tenga alcohol', async () => {
  const employee = api(await login('sofia.sincobertura'));
  const approver = api(await login('pedro.aprobador'));
  const tripId = await submitTrip(employee, 'Rendición con el gerente como jefe');
  await supabase.from('Viaje').update({estado: 'EN_CURSO', fue_iniciado: true, tiene_alcohol: true}).eq('id_viaje', tripId);
  const submitted = await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []});
  expect(submitted.status).toBe(200);
  expect((await tripOf(tripId)).id_supervisor_asignado).toBe(approverId);
  const approved = await approver.post(`/review/expense-review/${tripId}/approve`);
  expect(approved.status).toBe(200);
  const trip = await tripOf(tripId);
  expect(trip.estado).toBe('APROBADO_SUPERVISOR');
  expect(trip.id_revisor_asignado).toBe(await idOf('lucia.revisora@maxam.com'));
});

// Como jefe directo, el aprobador observa y rechaza el viaje y la rendicion de su equipo
test('el aprobador como jefe directo observa y rechaza el viaje y la rendición', async () => {
  const employee = api(await login('sofia.sincobertura'));
  const approver = api(await login('pedro.aprobador'));
  const tripId = await submitTrip(employee, 'Viaje que el gerente observa');
  expect((await approver.post(`/review/trip-review/${tripId}/comment`, {descripcion: 'Indica el cliente a visitar'})).status).toBe(200);
  expect((await approver.post(`/review/trip-review/${tripId}/reject`)).status).toBe(200);
  expect((await tripOf(tripId)).estado).toBe('RECHAZADO');
  await supabase.from('Viaje').update({estado: 'EN_CURSO', fue_iniciado: true}).eq('id_viaje', tripId);
  const expense = await employee.postForm('/expense/register', {
    id_viaje: tripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi', id_categoria: 1, es_gasto_internacional: false,
  }, ['imagen']);
  const expenseId = expense.body.gasto?.id_gasto || expense.body.id_gasto;
  expect((await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []})).status).toBe(200);
  expect((await approver.post(`/review/expense-review/${tripId}/comment`, {descripcion: 'Falta el detalle del taxi', id_gasto: expenseId})).status).toBe(200);
  expect((await approver.post(`/review/expense-review/${tripId}/reject`)).status).toBe(200);
  expect((await tripOf(tripId)).estado).toBe('RECHAZADO');
});
