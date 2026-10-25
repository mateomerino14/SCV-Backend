const {login, api} = require('./helpers');

jest.setTimeout(60000);

// El administrador guarda el nombre exacto del empleado como proveedor en Oracle, en mayusculas, y puede quitarlo
test('guarda el nombre de proveedor en Oracle del empleado', async () => {
  const admin = api(await login('admin.prueba'));
  const users = (await admin.get('/user')).body;
  const employee = users.find((user) => user.email_corporativo === 'juan.empleado@maxam.com');
  const saved = await admin.put(`/user/${employee.id_usuario}`, {nombre_proveedor_oracle: ' empleado, juan (bol) '});
  expect(saved.status).toBe(200);
  let refreshed = (await admin.get('/user')).body.find((user) => user.id_usuario === employee.id_usuario);
  expect(refreshed.nombre_proveedor_oracle).toBe('EMPLEADO, JUAN (BOL)');
  await admin.put(`/user/${employee.id_usuario}`, {nombre_proveedor_oracle: ''});
  refreshed = (await admin.get('/user')).body.find((user) => user.id_usuario === employee.id_usuario);
  expect(refreshed.nombre_proveedor_oracle).toBeNull();
});
