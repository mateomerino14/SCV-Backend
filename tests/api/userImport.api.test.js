// Los correos de bienvenida no salen de verdad: se anotan para revisar a quien se enviaron
jest.mock('../../src/services/shared/emailService', () => ({...jest.requireActual('../../src/services/shared/emailService'), sendEmail: jest.fn().mockResolvedValue()}));
const emailService = require('../../src/services/shared/emailService');
const {login, api} = require('./helpers');

jest.setTimeout(60000);

// Espera a que terminen los correos que se mandan en segundo plano
const waitForEmails = async (count) => {
  for (let attempt = 0; attempt < 50 && emailService.sendEmail.mock.calls.length < count; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return emailService.sendEmail.mock.calls.map(([to]) => to[0].email);
};

const boss = {fila: 2, nombre: 'Rosa', apellido_paterno: 'Importada', email_corporativo: 'rosa.importada@maxam.com', cargo: 'Jefe de Area de Prueba', seccion: 'Ventas', rol: 'SUPERVISOR', codigo_dependencia: '421'};
const employee = {fila: 3, nombre: 'Luis', apellido_paterno: 'Importado', email_corporativo: 'luis.importado@maxam.com', carnet_identidad: '9988776', cargo: 'analista de prueba', seccion: 'VENTAS', correo_jefe: 'rosa.importada@maxam.com'};
const existing = {fila: 4, nombre: 'Juan', apellido_paterno: 'Repetido', email_corporativo: 'juan.empleado@maxam.com', cargo: 'Analista de Prueba'};
const repeated = {...employee, fila: 5, nombre: 'Luisa'};

// La vista previa no guarda nada y marca repetidos del sistema y del archivo
test('valida el Excel de usuarios sin guardar nada', async () => {
  const admin = api(await login('admin.prueba'));
  const response = await admin.post('/user/import/preview', {filas: [boss, employee, existing, repeated]});
  expect(response.status).toBe(200);
  const [bossRow, employeeRow, existingRow, repeatedRow] = response.body.filas;
  expect(bossRow.valido).toBe(true);
  expect(employeeRow.valido).toBe(false);
  expect(employeeRow.errores).toContain('Correo repetido en el archivo (también en la fila 5)');
  expect(existingRow.errores).toContain('Ya existe un usuario con ese correo en el sistema');
  expect(repeatedRow.errores).toContain('CI repetido en el archivo (también en la fila 3)');
  const users = (await admin.get('/user')).body;
  expect(users.some((user) => user.email_corporativo === boss.email_corporativo)).toBe(false);
});

// Solo el administrador puede importar
test('no deja importar a quien no es administrador', async () => {
  const employeeApi = api(await login('juan.empleado'));
  expect((await employeeApi.post('/user/import/preview', {filas: [boss]})).status).toBe(403);
});

// Crea primero al jefe del archivo, luego a su subordinado, y omite las filas con errores
test('crea las filas validas con su jefe del mismo archivo y omite las demas', async () => {
  const admin = api(await login('admin.prueba'));
  const response = await admin.post('/user/import', {filas: [employee, boss, existing]});
  expect(response.status).toBe(200);
  expect(response.body.creados).toBe(2);
  expect(response.body.omitidos).toEqual([{fila: 4, errores: ['Ya existe un usuario con ese correo en el sistema']}]);
  const users = (await admin.get('/user')).body;
  const createdBoss = users.find((user) => user.email_corporativo === boss.email_corporativo);
  const createdEmployee = users.find((user) => user.email_corporativo === employee.email_corporativo);
  try {
    expect(createdBoss).toMatchObject({codigo_dependencia: '421', activo: true});
    const detailed = (await admin.get('/user/all')).body.find((user) => user.id_usuario === createdEmployee.id_usuario);
    expect(detailed).toMatchObject({id_jefe_directo: createdBoss.id_usuario, carnet_identidad: '9988776'});
    expect((await waitForEmails(2)).sort()).toEqual([employee.email_corporativo, boss.email_corporativo]);
    const again = await admin.post('/user/import/preview', {filas: [employee]});
    expect(again.body.filas[0].errores).toContain('Ya existe un usuario con ese correo en el sistema');
  }
  finally {
    await admin.del(`/user/${createdEmployee.id_usuario}`);
    await admin.del(`/user/${createdBoss.id_usuario}`);
  }
});

// Un archivo vacio o sin filas validas no crea nada
test('rechaza un archivo sin filas validas', async () => {
  const admin = api(await login('admin.prueba'));
  expect((await admin.post('/user/import', {filas: []})).status).toBe(400);
  expect((await admin.post('/user/import', {filas: [existing]})).status).toBe(400);
});
