const supabase = require('../../src/config/supabase');
const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(120000);

// Id del usuario con ese correo
const idOf = async (email) => (await supabase.from('Usuario').select('id_usuario').eq('email_corporativo', email).single()).data.id_usuario;

// Estado, alcohol y asignaciones actuales del viaje
const tripOf = async (tripId) => (await supabase.from('Viaje').select('estado, tiene_alcohol, id_aprobador_asignado, id_revisor_asignado').eq('id_viaje', tripId).single()).data;

// Lista de la respuesta, venga sola o dentro de un objeto
const listOf = (body) => {
  if (Array.isArray(body)) {
    return body;
  }
  return Object.values(body || {}).find((value) => Array.isArray(value)) || [];
};

// Crea un viaje nacional y lo deja en curso, como si tesoreria ya hubiera asignado el fondo
const startedTrip = async (client, motivo) => {
  const created = await client.post('/trip', {
    motivo, origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 600,
  });
  await supabase.from('Viaje').update({estado: 'EN_CURSO', fue_iniciado: true}).eq('id_viaje', created.body.id_viaje);
  return created.body.id_viaje;
};

// Registra un recibo con cerveza en el detalle, que el sistema marca como gasto con alcohol
const registerBeerReceipt = async (client, tripId) => {
  const response = await client.postForm('/invoice/save', {
    id_viaje: tripId, proveedor: 'Tienda de prueba', numero_factura: `A-${Date.now() % 100000}`, nit: '1020306', fecha_emision: boliviaDate(), tipo_doc: 'R',
    monto: 30, iva: 0, monto_total: 30, id_categoria_gasto: 1, detalle: [{nombre_producto: 'Cerveza Paceña', cantidad: 2, precio: 15}],
  });
  return response.body.gasto?.id_gasto || response.body.id_gasto;
};

// Registra un gasto sin factura comun, sin alcohol
const registerTaxi = (client, tripId) => client.postForm('/expense/register', {
  id_viaje: tripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi al hotel', id_categoria: 1, es_gasto_internacional: false,
}, ['imagen']);

// Con alcohol, la rendicion pasa del jefe directo al aprobador y de ahi al revisor
test('la rendición con alcohol pasa por el aprobador antes del revisor', async () => {
  const employee = api(await login('carlos.empleado'));
  const boss = api(await login('jorge.supervisor'));
  const approver = api(await login('pedro.aprobador'));
  const tripId = await startedTrip(employee, 'Rendición con cerveza');
  await registerBeerReceipt(employee, tripId);
  expect((await tripOf(tripId)).tiene_alcohol).toBe(true);
  expect((await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []})).status).toBe(200);
  expect((await boss.post(`/review/expense-review/${tripId}/approve`)).status).toBe(200);
  const atApprover = await tripOf(tripId);
  expect(atApprover.estado).toBe('EN_REVISION_APROBADOR');
  expect(atApprover.id_aprobador_asignado).toBe(await idOf('pedro.aprobador@maxam.com'));
  expect(listOf((await approver.get('/approver/alcohol-review/mine')).body).map((trip) => trip.id_viaje)).toContain(tripId);
  expect((await approver.post(`/approver/alcohol-review/${tripId}/approve`, {firma: null})).status).toBe(400);
  expect((await approver.post(`/approver/alcohol-review/${tripId}/approve`)).status).toBe(200);
  const atReviewer = await tripOf(tripId);
  expect(atReviewer.estado).toBe('APROBADO_SUPERVISOR');
  expect(atReviewer.id_revisor_asignado).toBe(await idOf('lucia.revisora@maxam.com'));
  // El gerente que reviso los gastos no deducibles firma el Vo/ Bo Gerente de Area
  const signatures = (await employee.get(`/trip/${tripId}/firmas-planilla`)).body;
  expect(signatures.jefe.nombre).toBe('Jorge Supervisor');
  expect(signatures.gerente.nombre).toBe('Pedro Aprobador');
  expect(signatures.gerenteNoRequerido).toBe(false);
});

// Si el aprobador la rechaza y el empleado quita el gasto con alcohol, la rendicion ya no vuelve al aprobador
test('al quitar el gasto con alcohol tras el rechazo, la rendición ya no pasa por el aprobador', async () => {
  const employee = api(await login('carlos.empleado'));
  const boss = api(await login('jorge.supervisor'));
  const approver = api(await login('pedro.aprobador'));
  const tripId = await startedTrip(employee, 'Rendición que pierde el alcohol');
  const beerId = await registerBeerReceipt(employee, tripId);
  await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []});
  await boss.post(`/review/expense-review/${tripId}/approve`);
  expect((await approver.post(`/approver/alcohol-review/${tripId}/reject`)).status).toBe(400);
  expect((await approver.post(`/approver/alcohol-review/${tripId}/comment`, {descripcion: 'La cerveza no es un gasto permitido', id_gasto: beerId})).status).toBe(200);
  expect((await approver.post(`/approver/alcohol-review/${tripId}/reject`)).status).toBe(200);
  expect((await tripOf(tripId)).estado).toBe('RECHAZADO');
  expect((await employee.del(`/expense/${beerId}`)).status).toBe(200);
  expect((await tripOf(tripId)).tiene_alcohol).toBe(false);
  expect((await registerTaxi(employee, tripId)).status).toBe(200);
  expect((await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []})).status).toBe(200);
  expect((await boss.post(`/review/expense-review/${tripId}/approve`)).status).toBe(200);
  expect((await tripOf(tripId)).estado).toBe('APROBADO_SUPERVISOR');
});

// El reemplazo solo puede ser alguien activo de la misma seccion, y el revisor lo aprueba
test('el reemplazo se elige en la misma sección, no se duplica y, aprobado, puede rendir', async () => {
  const owner = api(await login('juan.empleado'));
  const reviewer = api(await login('lucia.revisora'));
  const substitute = api(await login('ana.empleada'));
  const anaId = await idOf('ana.empleada@maxam.com');
  const candidates = listOf((await owner.get('/substitution/candidates')).body).map((candidate) => candidate.id_usuario);
  expect(candidates).toContain(anaId);
  expect(candidates).not.toContain(await idOf('juan.empleado@maxam.com'));
  expect(candidates).not.toContain(await idOf('carlos.empleado@maxam.com'));
  expect(candidates).not.toContain(await idOf('lucia.revisora@maxam.com'));
  const tripId = await startedTrip(owner, 'Viaje con reemplazo solicitado');
  expect((await owner.post(`/substitution/trip/${tripId}/request`, {id_sustituto: await idOf('carlos.empleado@maxam.com')})).status).toBe(400);
  expect((await owner.post(`/substitution/trip/${tripId}/request`, {id_sustituto: anaId})).status).toBe(200);
  expect((await owner.post(`/substitution/trip/${tripId}/request`, {id_sustituto: anaId})).status).toBe(400);
  expect((await registerTaxi(substitute, tripId)).status).toBe(403);
  const pending = listOf((await reviewer.get('/substitution/pending')).body).find((request) => request.id_viaje === tripId);
  expect(pending).toBeDefined();
  expect((await reviewer.post(`/substitution/${pending.id_solicitud}/approve`)).status).toBe(200);
  expect((await registerTaxi(substitute, tripId)).status).toBe(200);
});

// Un viaje rechazado antes de recibir fondos no tiene gastos que rendir: no admite reemplazo
test('no se puede pedir reemplazo en un viaje rechazado antes de iniciarse', async () => {
  const owner = api(await login('juan.empleado'));
  const created = await owner.post('/trip', {
    motivo: 'Viaje rechazado antes de iniciar', origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 600,
  });
  await supabase.from('Viaje').update({estado: 'RECHAZADO', fue_iniciado: false}).eq('id_viaje', created.body.id_viaje);
  const response = await owner.post(`/substitution/trip/${created.body.id_viaje}/request`, {id_sustituto: await idOf('ana.empleada@maxam.com')});
  expect(response.status).toBe(400);
});

// Si el empleado envia la rendicion antes de que respondan, la solicitud se cierra sola
test('la solicitud pendiente se cierra sola al enviar la rendición', async () => {
  const owner = api(await login('juan.empleado'));
  const reviewer = api(await login('lucia.revisora'));
  const tripId = await startedTrip(owner, 'Viaje que se rinde antes de responder');
  const created = await owner.post(`/substitution/trip/${tripId}/request`, {id_sustituto: await idOf('ana.empleada@maxam.com')});
  const requestId = created.body.solicitud.id_solicitud;
  expect((await owner.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []})).status).toBe(200);
  const {data: request} = await supabase.from('Solicitud_Reemplazo').select('estado, id_revisor').eq('id_solicitud', requestId).single();
  expect(request.estado).toBe('RECHAZADA');
  expect(request.id_revisor).toBeNull();
  expect((await reviewer.post(`/substitution/${requestId}/approve`)).status).toBe(409);
});

// El reemplazo aprobado firma al enviar la rendicion: queda como quien la preparo, y el viaje sigue siendo del titular
test('el reemplazo firma al enviar la rendición del titular', async () => {
  const owner = api(await login('juan.empleado'));
  const reviewer = api(await login('lucia.revisora'));
  const substitute = api(await login('ana.empleada'));
  const boss = api(await login('maria.supervisora'));
  const tripId = await startedTrip(owner, 'Viaje que rinde el reemplazo');
  const created = await owner.post(`/substitution/trip/${tripId}/request`, {id_sustituto: await idOf('ana.empleada@maxam.com')});
  expect((await reviewer.post(`/substitution/${created.body.solicitud.id_solicitud}/approve`)).status).toBe(200);
  expect((await registerTaxi(substitute, tripId)).status).toBe(200);
  expect((await substitute.put(`/trip/${tripId}/confirm-completion`, {justificaciones: [], firma: 'data:image/png;base64,AAAA'})).status).toBe(400);
  expect((await substitute.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []})).status).toBe(200);
  expect((await boss.post(`/review/expense-review/${tripId}/approve`)).status).toBe(200);
  const signatures = (await owner.get(`/trip/${tripId}/firmas-planilla`)).body;
  expect(signatures.preparado.nombre).toBe('Ana Empleada');
  expect(signatures.jefe.nombre).toBe('María Supervisora');
  expect(signatures.gerenteNoRequerido).toBe(true);
  const {data: trip} = await supabase.from('Viaje').select('id_usuario').eq('id_viaje', tripId).single();
  expect(trip.id_usuario).toBe(await idOf('juan.empleado@maxam.com'));
});
