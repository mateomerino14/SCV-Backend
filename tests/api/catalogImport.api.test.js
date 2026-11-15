const {login, api} = require('./helpers');

jest.setTimeout(60000);

let admin;
let employee;
const stamp = String(Date.now()).slice(-6);
let code;

beforeAll(async () => {
  admin = api(await login('admin.prueba'));
  employee = api(await login('juan.empleado'));
  const used = new Set((await admin.get('/section')).body.map((section) => section.codigo_seccion));
  code = String(Array.from({length: 900}, (_, index) => index + 100).find((value) => !used.has(String(value))));
});

// Solo el administrador revisa e importa catalogos
test('solo el administrador importa secciones y cargos', async () => {
  const forbidden = await employee.post('/section/import/preview', {filas: [{fila: 2, codigo_seccion: '123', nombre: 'X'}]});
  expect(forbidden.status).toBe(403);
  const empty = await admin.post('/position/import/preview', {filas: []});
  expect(empty.status).toBe(400);
});

// La revision dice fila por fila que se crea, que se actualiza y que tiene errores, sin guardar nada
test('revisa el Excel de secciones sin guardar nada', async () => {
  const sections = await admin.get('/section');
  const ventas = sections.body.find((section) => section.nombre === 'Ventas');
  const response = await admin.post('/section/import/preview', {filas: [
    {fila: 2, codigo_seccion: code, nombre: `Sección Importada ${stamp}`, estado: ''},
    {fila: 3, codigo_seccion: '12', nombre: 'Código corto'},
    {fila: 4, codigo_seccion: code, nombre: 'Otra con el mismo código'},
    {fila: 5, codigo_seccion: '777', nombre: 'Ventas'},
    {fila: 6, codigo_seccion: '778', nombre: 'Estado raro', estado: 'quizás'},
  ]});
  expect(response.status).toBe(200);
  const [created, shortCode, repeated, existingName, badStatus] = response.body.filas;
  expect(created).toMatchObject({accion: 'Crear', valido: true});
  expect(shortCode.errores).toContain('La sección de Oracle debe tener 3 dígitos');
  expect(repeated.errores).toContain('Se repite con la fila 2');
  expect(existingName.valido).toBe(ventas.codigo_seccion === null);
  expect(badStatus.errores).toContain('El estado debe ser Activo o Suspendido');
  const after = await admin.get('/section');
  expect(after.body.some((section) => section.codigo_seccion === code)).toBe(false);
});

// Importa las secciones correctas y al subir el mismo archivo cambiado actualiza en vez de duplicar
test('crea secciones y luego las actualiza por su código', async () => {
  const name = `Sección Importada ${stamp}`;
  const first = await admin.post('/section/import', {filas: [{fila: 2, codigo_seccion: code, nombre: name}, {fila: 3, codigo_seccion: 'abc', nombre: 'Mala'}]});
  expect(first.body).toMatchObject({creados: 1, actualizados: 0});
  expect(first.body.omitidos.map((row) => row.fila)).toEqual([3]);
  const second = await admin.post('/section/import', {filas: [{fila: 2, codigo_seccion: code, nombre: `${name} Renombrada`, estado: 'Suspendido'}]});
  expect(second.body).toMatchObject({creados: 0, actualizados: 1});
  const third = await admin.post('/section/import/preview', {filas: [{fila: 2, codigo_seccion: code, nombre: `${name} Renombrada`, estado: 'Suspendido'}]});
  expect(third.body.filas[0].accion).toBe('Sin cambios');
  const saved = (await admin.get('/section')).body.find((section) => section.codigo_seccion === code);
  expect(saved).toMatchObject({nombre: `${name} Renombrada`, activo: false});
});

// Los cargos se reconocen por el nombre y llevan su tipo de la escala
test('importa cargos con su tipo de viático', async () => {
  const name = `Cargo Importado ${stamp}`;
  const preview = await admin.post('/position/import/preview', {filas: [
    {fila: 2, nombre: name, tipo_viatico: 'b'},
    {fila: 3, nombre: 'Sin tipo', tipo_viatico: ''},
    {fila: 4, nombre: name.toUpperCase(), tipo_viatico: 'C'},
  ]});
  const [valid, withoutType, repeated] = preview.body.filas;
  expect(valid).toMatchObject({accion: 'Crear', tipo_viatico: 'B', valido: true});
  expect(withoutType.errores).toContain('El tipo de viático debe ser A, B o C');
  expect(repeated.errores).toContain('Se repite con la fila 2');
  const created = await admin.post('/position/import', {filas: [{fila: 2, nombre: name, tipo_viatico: 'B'}]});
  expect(created.body).toMatchObject({creados: 1});
  const updated = await admin.post('/position/import', {filas: [{fila: 2, nombre: `  ${name.toLowerCase()} `, tipo_viatico: 'C'}]});
  expect(updated.body).toMatchObject({creados: 0, actualizados: 1});
  const saved = (await admin.get('/position')).body.find((position) => position.nombre.toLowerCase() === name.toLowerCase());
  expect(saved.tipo_viatico).toBe('C');
  await admin.del(`/position/${saved.id_cargo}`);
});
