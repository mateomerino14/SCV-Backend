const supabase = require('../../src/config/supabase');
const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(180000);

const users = ['juan.empleado', 'sofia.sincobertura', 'maria.supervisora', 'jorge.supervisor', 'pedro.aprobador', 'lucia.revisora', 'tesoro.prueba', 'admin.prueba'];
const clients = {};
const ids = {};
let originalBosses = {};

// Id del usuario de prueba
const idOf = async (user) => (await supabase.from('Usuario').select('id_usuario').eq('email_corporativo', `${user}@maxam.com`).single()).data.id_usuario;

// Cambia el jefe directo de un usuario de prueba durante la prueba
const setBoss = async (user, bossUser) => {
  let bossId = null;
  if (bossUser) {
    bossId = ids[bossUser];
  }
  await supabase.from('Usuario').update({id_jefe_directo: bossId}).eq('id_usuario', ids[user]);
};

// Estado y asignaciones actuales del viaje
const tripOf = async (tripId) => (await supabase.from('Viaje').select('estado, id_usuario, id_supervisor_asignado, id_aprobador_asignado, id_revisor_asignado').eq('id_viaje', tripId).single()).data;

// Nombre de usuario de prueba a partir de su id
const userOfId = (id) => Object.keys(ids).find((user) => ids[user] === id);

// Supervisor que atiende la etapa: el asignado o, si quedo para todos, un supervisor que la toma
const supervisorFor = async (tripId, stage, takerUser) => {
  const trip = await tripOf(tripId);
  if (trip.id_supervisor_asignado) {
    return userOfId(trip.id_supervisor_asignado);
  }
  expect((await clients[takerUser].post(`/review/${stage}/${tripId}/take`)).status).toBe(200);
  return takerUser;
};

// Recorre el viaje de punta a punta y devuelve quien atendio cada etapa; las que se aprueban solas no aparecen
const runTrip = async (owner, {alcohol = false, takerUser = 'maria.supervisora'} = {}) => {
  const client = clients[owner];
  const created = await client.post('/trip', {
    motivo: `Caso de jerarquía de ${owner}`, origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 600,
  });
  expect(created.status).toBe(200);
  const tripId = created.body.id_viaje;
  expect((await client.put(`/trip/${tripId}/submit-review`)).status).toBe(200);
  const actors = [];
  for (let step = 0; step < 12; step++) {
    const trip = await tripOf(tripId);
    if (trip.estado === 'APROBADO_FINAL') {
      break;
    }
    if (trip.estado === 'EN_REVISION_VIAJE') {
      const supervisor = await supervisorFor(tripId, 'trip-review', takerUser);
      expect((await clients[supervisor].post(`/review/trip-review/${tripId}/approve`)).status).toBe(200);
      actors.push(['revisión del viaje', supervisor]);
    }
    else if (trip.estado === 'APROBADO_VIAJE') {
      expect((await clients['pedro.aprobador'].post(`/approver/trip/${tripId}/approve`)).status).toBe(200);
      actors.push(['aprobación del viaje', 'pedro.aprobador']);
    }
    else if (trip.estado === 'EN_REVISION_TESORERO') {
      expect((await clients['tesoro.prueba'].post(`/treasurer/${tripId}/approve`)).status).toBe(200);
      actors.push(['fondos', 'tesoro.prueba']);
    }
    else if (trip.estado === 'EN_CURSO') {
      const registered = await client.postForm('/expense/register', {id_viaje: tripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi al hotel', id_categoria: 1, es_gasto_internacional: false}, ['imagen']);
      expect([registered.status, registered.body.error]).toEqual([200, undefined]);
      if (alcohol) {
        await supabase.from('Viaje').update({tiene_alcohol: true}).eq('id_viaje', tripId);
      }
      const sent = await client.put(`/trip/${tripId}/confirm-completion`, {justificaciones: [{fecha: boliviaDate(), descripcion: 'Taxi necesario para llegar al cliente'}]});
      expect([sent.status, sent.body.error]).toEqual([200, undefined]);
      actors.push(['envío de la rendición', owner]);
    }
    else if (trip.estado === 'EN_REVISION') {
      const supervisor = await supervisorFor(tripId, 'expense-review', takerUser);
      expect((await clients[supervisor].post(`/review/expense-review/${tripId}/approve`)).status).toBe(200);
      actors.push(['aprobación de la rendición', supervisor]);
    }
    else if (trip.estado === 'EN_REVISION_APROBADOR') {
      expect((await clients['pedro.aprobador'].post(`/approver/alcohol-review/${tripId}/approve`)).status).toBe(200);
      actors.push(['gastos no deducibles', 'pedro.aprobador']);
    }
    else if (trip.estado === 'APROBADO_SUPERVISOR') {
      expect((await clients['lucia.revisora'].post(`/reviewer/${tripId}/approve`)).status).toBe(200);
      actors.push(['revisión final', 'lucia.revisora']);
    }
    else {
      throw new Error(`Estado inesperado ${trip.estado}`);
    }
  }
  expect((await tripOf(tripId)).estado).toBe('APROBADO_FINAL');
  return {tripId, actors};
};

// Firmas del viaje por etapa: quien firmo y si fue automatica
const signaturesOf = async (tripId) => {
  const {data} = await supabase.from('Firma').select('etapa, id_usuario, automatica').eq('id_viaje', tripId);
  const byStage = {};
  (data || []).forEach((signature) => {
    byStage[signature.etapa] = {usuario: userOfId(signature.id_usuario), automatica: signature.automatica};
  });
  return byStage;
};

beforeAll(async () => {
  for (const user of users) {
    ids[user] = await idOf(user);
    clients[user] = api(await login(user));
  }
  const {data} = await supabase.from('Usuario').select('id_usuario, id_jefe_directo').in('id_usuario', Object.values(ids));
  originalBosses = Object.fromEntries((data || []).map((row) => [row.id_usuario, row.id_jefe_directo]));
  await setBoss('pedro.aprobador', null);
});

afterAll(async () => {
  for (const [userId, bossId] of Object.entries(originalBosses)) {
    await supabase.from('Usuario').update({id_jefe_directo: bossId}).eq('id_usuario', userId);
  }
});

// Empleado cuyo jefe directo es un supervisor: el supervisor revisa y aprueba la rendicion, el Gerente General aprueba el viaje
test('empleado con jefe supervisor: pasa por el supervisor, el gerente general, tesorería y el revisor', async () => {
  const {tripId, actors} = await runTrip('juan.empleado', {alcohol: true});
  expect(actors).toEqual([
    ['revisión del viaje', 'maria.supervisora'],
    ['aprobación del viaje', 'pedro.aprobador'],
    ['fondos', 'tesoro.prueba'],
    ['envío de la rendición', 'juan.empleado'],
    ['aprobación de la rendición', 'maria.supervisora'],
    ['gastos no deducibles', 'pedro.aprobador'],
    ['revisión final', 'lucia.revisora'],
  ]);
  expect(await signaturesOf(tripId)).toEqual({
    MEMORANDUM: {usuario: 'pedro.aprobador', automatica: false},
    PREPARADO: {usuario: 'juan.empleado', automatica: false},
    JEFE: {usuario: 'maria.supervisora', automatica: false},
    GERENTE: {usuario: 'pedro.aprobador', automatica: false},
    REVISOR: {usuario: 'lucia.revisora', automatica: false},
  });
});

// Empleado cuyo jefe directo es el Gerente General: el gerente lo revisa como jefe y no aprueba dos veces
test('empleado con jefe gerente general: el gerente revisa como jefe y sus otras etapas se aprueban solas', async () => {
  await setBoss('sofia.sincobertura', 'pedro.aprobador');
  const {tripId, actors} = await runTrip('sofia.sincobertura', {alcohol: true});
  await setBoss('sofia.sincobertura', null);
  expect(actors).toEqual([
    ['revisión del viaje', 'pedro.aprobador'],
    ['fondos', 'tesoro.prueba'],
    ['envío de la rendición', 'sofia.sincobertura'],
    ['aprobación de la rendición', 'pedro.aprobador'],
    ['revisión final', 'lucia.revisora'],
  ]);
  const signatures = await signaturesOf(tripId);
  expect(signatures.MEMORANDUM).toEqual({usuario: 'pedro.aprobador', automatica: false});
  expect(signatures.JEFE).toEqual({usuario: 'pedro.aprobador', automatica: false});
  expect(signatures.GERENTE).toBeUndefined();
});

// Supervisor que viaja: su jefe directo es el Gerente General
test('supervisor que viaja: lo revisa el gerente general como su jefe directo', async () => {
  const {actors} = await runTrip('maria.supervisora');
  expect(actors).toEqual([
    ['revisión del viaje', 'pedro.aprobador'],
    ['fondos', 'tesoro.prueba'],
    ['envío de la rendición', 'maria.supervisora'],
    ['aprobación de la rendición', 'pedro.aprobador'],
    ['revisión final', 'lucia.revisora'],
  ]);
});

// Supervisor sin jefe directo y solo en su seccion: lo toma otro supervisor, nunca el mismo
test('supervisor sin jefe directo: lo revisa otro supervisor', async () => {
  await setBoss('jorge.supervisor', null);
  const {actors} = await runTrip('jorge.supervisor', {takerUser: 'maria.supervisora'});
  expect(actors.filter(([stage]) => stage === 'revisión del viaje' || stage === 'aprobación de la rendición')).toEqual([
    ['revisión del viaje', 'maria.supervisora'],
    ['aprobación de la rendición', 'maria.supervisora'],
  ]);
  expect(actors).toContainEqual(['aprobación del viaje', 'pedro.aprobador']);
});

// Gerente General que viaja: no tiene supervisor, asi que sus etapas de supervisor y de aprobador se aprueban solas
test('gerente general que viaja: solo pasa por tesorería y por el revisor', async () => {
  const {tripId, actors} = await runTrip('pedro.aprobador', {alcohol: true});
  expect(actors).toEqual([
    ['fondos', 'tesoro.prueba'],
    ['envío de la rendición', 'pedro.aprobador'],
    ['revisión final', 'lucia.revisora'],
  ]);
  expect(await signaturesOf(tripId)).toEqual({
    MEMORANDUM: {usuario: 'pedro.aprobador', automatica: true},
    PREPARADO: {usuario: 'pedro.aprobador', automatica: false},
    JEFE: {usuario: 'pedro.aprobador', automatica: true},
    GERENTE: {usuario: 'pedro.aprobador', automatica: true},
    REVISOR: {usuario: 'lucia.revisora', automatica: false},
  });
  const {data: reviews} = await supabase.from('Revision_Viaje').select('etapa, automatica').eq('id_viaje', tripId);
  expect(reviews.filter((review) => review.automatica).length).toBeGreaterThanOrEqual(3);
});

// Si el Gerente General tuviera un supervisor como jefe directo, ese supervisor lo revisa
test('gerente general con un supervisor como jefe: lo revisa ese supervisor', async () => {
  await setBoss('pedro.aprobador', 'maria.supervisora');
  const {actors} = await runTrip('pedro.aprobador');
  await setBoss('pedro.aprobador', null);
  expect(actors[0]).toEqual(['revisión del viaje', 'maria.supervisora']);
  expect(actors).toContainEqual(['aprobación de la rendición', 'maria.supervisora']);
});

// Revisor que viaja: su revision final se aprueba sola
test('revisor que viaja: la revisión final se aprueba sola', async () => {
  await setBoss('lucia.revisora', 'maria.supervisora');
  const {tripId, actors} = await runTrip('lucia.revisora');
  expect(actors).toEqual([
    ['revisión del viaje', 'maria.supervisora'],
    ['aprobación del viaje', 'pedro.aprobador'],
    ['fondos', 'tesoro.prueba'],
    ['envío de la rendición', 'lucia.revisora'],
    ['aprobación de la rendición', 'maria.supervisora'],
  ]);
  expect((await signaturesOf(tripId)).REVISOR).toEqual({usuario: 'lucia.revisora', automatica: true});
});

// Tesorero que viaja: la asignacion de su propio fondo se aprueba sola
test('tesorero que viaja: su propio fondo se aprueba solo', async () => {
  await setBoss('tesoro.prueba', 'maria.supervisora');
  const {actors} = await runTrip('tesoro.prueba');
  expect(actors).toEqual([
    ['revisión del viaje', 'maria.supervisora'],
    ['aprobación del viaje', 'pedro.aprobador'],
    ['envío de la rendición', 'tesoro.prueba'],
    ['aprobación de la rendición', 'maria.supervisora'],
    ['revisión final', 'lucia.revisora'],
  ]);
});

// Administrador que viaja sin jefe directo ni seccion: lo toma cualquier supervisor
test('administrador que viaja sin jefe: lo toma un supervisor', async () => {
  const {actors} = await runTrip('admin.prueba', {takerUser: 'jorge.supervisor'});
  expect(actors).toEqual([
    ['revisión del viaje', 'jorge.supervisor'],
    ['aprobación del viaje', 'pedro.aprobador'],
    ['fondos', 'tesoro.prueba'],
    ['envío de la rendición', 'admin.prueba'],
    ['aprobación de la rendición', 'jorge.supervisor'],
    ['revisión final', 'lucia.revisora'],
  ]);
});

// Nadie aprueba su propio viaje en una etapa que tiene a otra persona
test('nadie aprueba su propio viaje ni la rendición de otro sin estar asignado', async () => {
  await setBoss('jorge.supervisor', null);
  const created = await clients['jorge.supervisor'].post('/trip', {
    motivo: 'Viaje que su dueño no puede aprobar', origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 600,
  });
  const tripId = created.body.id_viaje;
  await clients['jorge.supervisor'].put(`/trip/${tripId}/submit-review`);
  expect((await clients['jorge.supervisor'].post(`/review/trip-review/${tripId}/approve`)).status).toBe(403);
  expect((await clients['pedro.aprobador'].post(`/approver/trip/${tripId}/approve`)).status).toBe(400);
  expect((await clients['lucia.revisora'].post(`/reviewer/${tripId}/approve`)).status).toBe(400);
});

// El tesorero ajusta el monto de su propio viaje al registrarlo; como su etapa de fondos se aprueba sola, queda ese monto
test('el fondo del viaje del tesorero es el monto que él ajustó al registrarlo', async () => {
  await setBoss('tesoro.prueba', 'maria.supervisora');
  const created = await clients['tesoro.prueba'].post('/trip', {
    motivo: 'Viaje del tesorero con monto ajustado', origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 777.5,
  });
  const tripId = created.body.id_viaje;
  await clients['tesoro.prueba'].put(`/trip/${tripId}/submit-review`);
  expect((await clients['maria.supervisora'].post(`/review/trip-review/${tripId}/approve`)).status).toBe(200);
  expect((await clients['pedro.aprobador'].post(`/approver/trip/${tripId}/approve`)).status).toBe(200);
  const {data: trip} = await supabase.from('Viaje').select('estado, monto_asignado').eq('id_viaje', tripId).single();
  expect(trip.estado).toBe('EN_CURSO');
  expect(parseFloat(trip.monto_asignado)).toBe(777.5);
});
