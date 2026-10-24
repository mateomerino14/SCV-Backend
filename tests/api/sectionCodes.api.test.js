const {login, api} = require('./helpers');

jest.setTimeout(60000);

let admin;

beforeAll(async () => {
  admin = api(await login('admin.prueba'));
});

// La seccion guarda sus codigos de Oracle de 3 digitos y rechaza los que no lo son
test('guarda los códigos de Oracle de la sección y valida que tengan 3 dígitos', async () => {
  const name = `Seccion Oracle ${Date.now() % 100000}`;
  const created = await admin.post('/section', {nombre: name, activo: true, codigo_dependencia: '421', codigo_seccion: '200'});
  expect(created.status).toBe(200);
  const section = created.body[0];
  expect(section).toMatchObject({codigo_dependencia: '421', codigo_seccion: '200'});
  const invalid = await admin.put(`/section/${section.id_seccion}`, {codigo_dependencia: '42A'});
  expect(invalid.status).toBe(400);
  const cleared = await admin.put(`/section/${section.id_seccion}`, {codigo_seccion: ''});
  expect(cleared.body[0].codigo_seccion).toBeNull();
  expect((await admin.del(`/section/${section.id_seccion}`)).status).toBe(200);
});
