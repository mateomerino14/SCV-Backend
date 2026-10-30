const {login, api, boliviaDate, request, app, testSignature} = require('./helpers');
const supabase = require('../../src/config/supabase');

jest.setTimeout(60000);

let employee;
let supervisor;
let approver;
let tripId;

beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  supervisor = api(await login('maria.supervisora'));
  approver = api(await login('pedro.aprobador'));
  const created = await employee.post('/trip', {
    motivo: 'Viaje con firmas', origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1), tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 900,
  });
  tripId = created.body.id_viaje;
  await employee.put(`/trip/${tripId}/submit-review`);
  await supervisor.post(`/review/trip-review/${tripId}/take`);
  await supervisor.post(`/review/trip-review/${tripId}/approve`);
});

// Sin trazo, o con algo que no es un PNG dibujado, no se aprueba ni se envia nada
test('pide la firma dibujada para aprobar el viaje', async () => {
  const withoutSignature = await approver.post(`/approver/trip/${tripId}/approve`, {firma: null});
  expect(withoutSignature.status).toBe(400);
  expect(withoutSignature.body.error).toBe('Firma en el recuadro antes de continuar');
  const fake = await approver.post(`/approver/trip/${tripId}/approve`, {firma: 'data:image/png;base64,"><script>'});
  expect(fake.status).toBe(400);
  const approved = await approver.post(`/approver/trip/${tripId}/approve`, {firma: testSignature});
  expect(approved.status).toBe(200);
});

// El memorandum queda registrado con su codigo y al verificarlo muestra quien autorizo el viaje
test('verifica el memorándum por su código', async () => {
  const {data: issued} = await supabase.from('Documento_Emitido').select('codigo, tipo').eq('id_viaje', tripId).eq('tipo', 'MEMORANDUM');
  expect(issued).toHaveLength(1);
  const verified = await request(app).get(`/document/verify/${issued[0].codigo.toLowerCase()}`);
  expect(verified.status).toBe(200);
  expect(verified.body.tipo).toBe('Memorándum de autorización de viaje');
  expect(verified.body.firmas[0]).toMatchObject({etapa: 'Autorizó el viaje', nombre: 'Pedro Aprobador'});
  expect(verified.body.firmas[0].imagen).toBeUndefined();
  expect((await request(app).get('/document/verify/AAAA-BBBB-CCCC')).status).toBe(404);
  expect((await request(app).get('/document/verify/123')).status).toBe(400);
});

// Enviar la rendicion pide la firma del empleado y aprobarla la del jefe; la planilla las muestra
test('la planilla lleva las firmas de quien la preparó y del jefe', async () => {
  await api(await login('tesoro.prueba')).post(`/treasurer/${tripId}/approve`);
  await employee.postForm('/expense/register', {id_viaje: tripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi', id_categoria_gasto: 1, es_gasto_internacional: false});
  expect((await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: [], firma: ''})).status).toBe(400);
  expect((await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []})).status).toBe(200);
  await supervisor.post(`/review/expense-review/${tripId}/take`);
  expect((await supervisor.post(`/review/expense-review/${tripId}/approve`, {firma: undefined})).status).toBe(400);
  expect((await supervisor.post(`/review/expense-review/${tripId}/approve`)).status).toBe(200);
  const signatures = (await employee.get(`/trip/${tripId}/firmas-planilla`)).body;
  expect(signatures.preparado).toMatchObject({nombre: 'Juan Empleado', automatica: false});
  expect(signatures.jefe.nombre).toBe('María Supervisora');
  expect(signatures.jefe.imagen.startsWith('data:image/png;base64,')).toBe(true);
  expect(signatures.gerente).toBeNull();
  const signatureService = require('../../src/services/shared/signatureService');
  const {generateStatementHtml} = require('../../src/services/trip/tripStatementService');
  const html = generateStatementHtml({id_viaje: tripId, tipo: 'Nacional', fecha_inicio: boliviaDate(), motivo: 'x', monto_asignado: 900, Usuario: {nombre: 'Juan'}}, [], [], {signatures: await signatureService.getStatementSignatures(tripId), seal: {code: 'ABCDEFGHJKMN', verifyUrl: 'https://scv.test/verificar/ABCDEFGHJKMN', qrDataUri: 'data:image/png;base64,AAAA'}});
  expect(html).toContain('class="firma-trazo"');
  expect(html).toContain('Firmado electrónicamente el');
  expect(html).toContain('ABCD-EFGH-JKMN');
  expect(html).toContain('Gerente de Área');
});
