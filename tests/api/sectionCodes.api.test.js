const {login, api} = require('./helpers');

jest.setTimeout(60000);

let admin;

beforeAll(async () => {
  admin = api(await login('admin.prueba'));
});

// La seccion guarda su codigo de Oracle de 3 digitos y rechaza el que no lo es
test('guarda el código de Oracle de la sección y valida que tenga 3 dígitos', async () => {
  const name = `Seccion Oracle ${Date.now() % 100000}`;
  const created = await admin.post('/section', {nombre: name, activo: true, codigo_seccion: '200'});
  expect(created.status).toBe(200);
  const section = created.body[0];
  expect(section).toMatchObject({codigo_seccion: '200'});
  const invalid = await admin.put(`/section/${section.id_seccion}`, {codigo_seccion: '20A'});
  expect(invalid.status).toBe(400);
  const cleared = await admin.put(`/section/${section.id_seccion}`, {codigo_seccion: ''});
  expect(cleared.body[0].codigo_seccion).toBeNull();
  expect((await admin.del(`/section/${section.id_seccion}`)).status).toBe(200);
});
