const {login, api, boliviaDate, request, app, testSignature, testPassword} = require('./helpers');
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

// Se firma con la firma guardada en el perfil: sin la contrasena correcta no se aprueba nada
test('pide la contraseña para firmar con la firma guardada', async () => {
  const withoutPassword = await approver.post(`/approver/trip/${tripId}/approve`, {contrasenia: ''});
  expect(withoutPassword.status).toBe(400);
  expect(withoutPassword.body.error).toBe('La contraseña no es correcta');
  expect((await approver.post(`/approver/trip/${tripId}/approve`, {contrasenia: 'otra-clave'})).status).toBe(400);
  const approved = await approver.post(`/approver/trip/${tripId}/approve`, {contrasenia: testPassword});
  expect(approved.status).toBe(200);
  const {data: memoSignature} = await supabase.from('Firma').select('imagen, automatica').eq('id_viaje', tripId).eq('etapa', 'MEMORANDUM').single();
  expect(memoSignature).toEqual({imagen: testSignature, automatica: false});
});

// Cada usuario registra o cambia su firma en el perfil con su contrasena, y la firma debe ser un trazo PNG
test('registra y cambia la firma digital del perfil', async () => {
  const user = api(await login('carlos.empleado'));
  expect((await user.get('/user/me/signature')).body.firma.imagen).toBe(testSignature);
  expect((await user.put('/user/me/signature', {firma: testSignature, contrasenia: 'otra-clave'})).status).toBe(400);
  const fake = await user.put('/user/me/signature', {firma: 'data:image/png;base64,"><script>', contrasenia: testPassword});
  expect(fake.status).toBe(400);
  expect(fake.body.error).toBe('Firma en el recuadro antes de continuar');
  const saved = await user.put('/user/me/signature', {firma: testSignature, contrasenia: testPassword});
  expect(saved.status).toBe(200);
  expect(saved.body.firma.imagen).toBe(testSignature);
});

// Sin firma registrada no se puede firmar, y tras muchos intentos con una contrasena equivocada se bloquea un rato
test('pide registrar la firma antes de firmar y frena los intentos con contraseña equivocada', async () => {
  const signatureService = require('../../src/services/shared/signatureService');
  const {data: carlos} = await supabase.from('Usuario').select('id_usuario').eq('email_corporativo', 'carlos.empleado@maxam.com').single();
  await supabase.from('Firma_Usuario').delete().eq('id_usuario', carlos.id_usuario);
  const user = api(await login('carlos.empleado'));
  expect((await user.get('/user/me/signature')).body.firma).toBeNull();
  expect(await signatureService.signatureForSigning(carlos.id_usuario, testPassword)).toEqual({error: 'Registra tu firma digital en tu perfil antes de firmar', status: 400});
  expect((await user.put('/user/me/signature', {firma: testSignature, contrasenia: testPassword})).status).toBe(200);
  expect(await signatureService.signatureForSigning(carlos.id_usuario, testPassword)).toEqual({image: testSignature});
  for (let attempt = 0; attempt < 10; attempt++) {
    expect((await signatureService.signatureForSigning(carlos.id_usuario, 'otra-clave')).status).toBe(400);
  }
  const blocked = await signatureService.signatureForSigning(carlos.id_usuario, testPassword);
  expect(blocked.status).toBe(429);
});

// El memorandum queda registrado con su codigo y al verificarlo muestra quien autorizo el viaje
test('verifica el memorándum por su código', async () => {
  const {data: issued} = await supabase.from('Documento_Emitido').select('codigo, tipo').eq('id_viaje', tripId).eq('tipo', 'MEMORANDUM');
  expect(issued).toHaveLength(1);
  const verified = await request(app).get(`/document/verify/${issued[0].codigo.toLowerCase()}`);
  expect(verified.status).toBe(200);
  expect(verified.body.tipo).toBe('Memorándum de autorización de viaje');
  expect(verified.body.firmas[0]).toMatchObject({etapa: 'Autorizó el viaje', nombre: 'Pedro Aprobador'});
  expect(verified.body.viaje.ruta).toMatch(/ → /);
  expect(verified.body.viaje).not.toHaveProperty('destino');
  expect(verified.body.firmas[0].imagen).toBeUndefined();
  expect((await request(app).get('/document/verify/AAAA-BBBB-CCCC')).status).toBe(404);
  expect((await request(app).get('/document/verify/123')).status).toBe(400);
});

// La planilla lleva Preparado por (empleado), Aprobado por (jefe directo) y Revisado/Registrado por (revisor)
test('la planilla lleva las firmas de quien la preparó, del jefe y del revisor', async () => {
  await api(await login('tesoro.prueba')).post(`/treasurer/${tripId}/approve`);
  await employee.postForm('/expense/register', {id_viaje: tripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi', id_categoria_gasto: 1, es_gasto_internacional: false});
  expect((await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: [], contrasenia: ''})).status).toBe(400);
  expect((await employee.put(`/trip/${tripId}/confirm-completion`, {justificaciones: []})).status).toBe(200);
  await supervisor.post(`/review/expense-review/${tripId}/take`);
  expect((await supervisor.post(`/review/expense-review/${tripId}/approve`, {contrasenia: 'otra-clave'})).status).toBe(400);
  expect((await supervisor.post(`/review/expense-review/${tripId}/approve`)).status).toBe(200);
  const signatures = (await employee.get(`/trip/${tripId}/firmas-planilla`)).body;
  expect(signatures.preparado).toMatchObject({nombre: 'Juan Empleado', automatica: false});
  expect(signatures.jefe.nombre).toBe('María Supervisora');
  expect(signatures.jefe.imagen.startsWith('data:image/png;base64,')).toBe(true);
  expect(signatures.revisor).toBeNull();
  const reviewer = api(await login('lucia.revisora'));
  expect((await reviewer.post(`/reviewer/${tripId}/approve`, {contrasenia: 'otra-clave'})).status).toBe(400);
  expect((await reviewer.post(`/reviewer/${tripId}/approve`)).status).toBe(200);
  const finalSignatures = (await employee.get(`/trip/${tripId}/firmas-planilla`)).body;
  expect(finalSignatures.revisor).toMatchObject({nombre: 'Lucía Revisora', automatica: false});
  expect(finalSignatures.gerente).toBeUndefined();
  const signatureService = require('../../src/services/shared/signatureService');
  const {generateStatementHtml} = require('../../src/services/trip/tripStatementService');
  const html = generateStatementHtml({id_viaje: tripId, tipo: 'Nacional', fecha_inicio: boliviaDate(), motivo: 'x', monto_asignado: 900, Usuario: {nombre: 'Juan'}}, [], [], {signatures: await signatureService.getStatementSignatures(tripId), seal: {code: 'ABCDEFGHJKMN', verifyUrl: 'https://scv.test/verificar/ABCDEFGHJKMN', qrDataUri: 'data:image/png;base64,AAAA'}});
  expect(html).toContain('class="firma-trazo"');
  expect(html).toContain('Firmado electrónicamente el');
  expect(html).toContain('ABCD-EFGH-JKMN');
  expect(html).toContain('Aprobado por');
  expect(html).toContain('Revisado/Registrado por');
  expect(html).not.toContain('Vo/ Bo');
});
