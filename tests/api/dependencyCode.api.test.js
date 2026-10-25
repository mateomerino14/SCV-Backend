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
