const {login, api} = require('./helpers');

jest.setTimeout(60000);

// El administrador guarda la dependencia de Oracle de un usuario (3 digitos) y rechaza otro formato
test('guarda la dependencia de Oracle del usuario y valida que tenga 3 dígitos', async () => {
  const admin = api(await login('admin.prueba'));
  const findUser = async () => (await admin.get('/user')).body.find((user) => user.email_corporativo === 'maria.supervisora@maxam.com');
  const boss = await findUser();
  expect((await admin.put(`/user/${boss.id_usuario}`, {codigo_dependencia: '421'})).status).toBe(200);
  expect((await findUser()).codigo_dependencia).toBe('421');
  expect((await admin.put(`/user/${boss.id_usuario}`, {codigo_dependencia: '42A'})).status).toBe(400);
  await admin.put(`/user/${boss.id_usuario}`, {codigo_dependencia: ''});
  expect((await findUser()).codigo_dependencia).toBeNull();
});

// La lista que usa la pantalla de usuarios trae la dependencia y el apellido materno, para no borrarlos al editar
test('devuelve la dependencia y el apellido materno en la lista de la pantalla de usuarios', async () => {
  const admin = api(await login('admin.prueba'));
  const findUser = async () => (await admin.get('/user/all')).body.find((user) => user.email_corporativo === 'jorge.supervisor@maxam.com');
  const boss = await findUser();
  await admin.put(`/user/${boss.id_usuario}`, {codigo_dependencia: '512', apellido_materno: 'Rojas'});
  const saved = await findUser();
  expect(saved.codigo_dependencia).toBe('512');
  expect(saved.apellido_materno).toBe('Rojas');
  await admin.put(`/user/${boss.id_usuario}`, {codigo_dependencia: ''});
});
