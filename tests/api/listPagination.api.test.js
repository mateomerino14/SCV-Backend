const supabase = require('../../src/config/supabase');
const {login, api} = require('./helpers');

jest.setTimeout(120000);

const bulkSize = 3000;
const emailDomain = 'carga.masiva.test';
let admin;
let employee;
let positionId;
let sectionId;

// Usuario numero "index" de la carga masiva: uno con tildes, 1 de cada 10 suspendido, la mitad en una seccion y 1 de cada 100 revisor sin seccion
const bulkUser = (index) => {
  const user = {
    email_corporativo: `usuario${index}@${emailDomain}`, nombre: `Persona${index}`, apellido_paterno: 'Masiva', contrasenia: 'sin-uso',
    activo: index % 10 !== 0, id_cargo: positionId, id_seccion: null, id_rol: 3,
  };
  if (index === 7) {
    user.nombre = 'Mónica';
    user.apellido_paterno = 'Pérez';
  }
  if (index % 2 === 0) {
    user.id_seccion = sectionId;
  }
  if (index % 100 === 1) {
    user.id_rol = 4;
  }
  return user;
};

// Crea miles de usuarios de prueba de una vez para medir la paginacion con volumen real
beforeAll(async () => {
  admin = api(await login('admin.prueba'));
  employee = api(await login('juan.empleado'));
  const {data: position} = await supabase.from('Cargo').select('id_cargo').limit(1).single();
  const {data: section} = await supabase.from('Seccion').select('id_seccion').eq('codigo_seccion', '837').single();
  positionId = position.id_cargo;
  sectionId = section.id_seccion;
  const rows = Array.from({length: bulkSize}, (_, index) => bulkUser(index));
  for (let start = 0; start < rows.length; start += 1000) {
    const {error} = await supabase.from('Usuario').insert(rows.slice(start, start + 1000));
    if (error) {
      throw new Error(error.message);
    }
  }
});

afterAll(async () => {
  await supabase.from('Usuario').delete().like('email_corporativo', `%@${emailDomain}`);
});

// La lista sale de a una pagina con el total, sin repetir usuarios entre paginas, y responde rapido con miles de filas
test('pagina los usuarios en el servidor con el total y sin repetir filas', async () => {
  const started = Date.now();
  const first = await admin.get('/user/all?page=1&limit=15');
  expect(Date.now() - started).toBeLessThan(2000);
  expect(first.status).toBe(200);
  expect(first.body.items).toHaveLength(15);
  expect(first.body.total).toBeGreaterThanOrEqual(bulkSize);
  const second = await admin.get('/user/all?page=2&limit=15');
  const firstIds = first.body.items.map((user) => user.id_usuario);
  expect(second.body.items.some((user) => firstIds.includes(user.id_usuario))).toBe(false);
  const last = await admin.get(`/user/all?page=${Math.ceil(first.body.total / 100)}&limit=100`);
  expect(last.body.items.length).toBeGreaterThan(0);
  const beyond = await admin.get('/user/all?page=99999&limit=100');
  expect(beyond.body).toMatchObject({items: [], total: first.body.total});
  const huge = await admin.get('/user/all?page=1&limit=5000');
  expect(huge.body.items).toHaveLength(100);
});

// La busqueda ignora tildes y mayusculas, combina palabras y se cruza con el rol y la seccion
test('busca y filtra usuarios en el servidor', async () => {
  const accent = await admin.get('/user/all?page=1&search=monica%20PEREZ');
  expect(accent.body.total).toBe(1);
  expect(accent.body.items[0].nombre).toBe('Mónica');
  const byEmail = await admin.get(`/user/all?page=1&search=usuario2999@${emailDomain}`);
  expect(byEmail.body.total).toBe(1);
  const reviewers = await admin.get(`/user/all?page=1&limit=100&rol=REVISOR&search=${emailDomain}`);
  expect(reviewers.body.total).toBe(bulkSize / 100);
  expect(reviewers.body.items.every((user) => user.Rol.nombre === 'REVISOR')).toBe(true);
  const inSection = await admin.get(`/user/all?page=1&seccion=${sectionId}&search=${emailDomain}`);
  expect(inSection.body.total).toBe(bulkSize / 2);
  const withoutSection = await admin.get(`/user/all?page=1&seccion=ninguna&search=${emailDomain}`);
  expect(withoutSection.body.total).toBe(bulkSize / 2);
  const badSection = await admin.get('/user/all?page=1&seccion=1;drop');
  expect(badSection.status).toBe(400);
  const symbols = await admin.get('/user/all?page=1&search=%22%2C%29(%2A');
  expect(symbols.status).toBe(200);
  const all = await admin.get(`/user/all?search=${emailDomain}&rol=REVISOR`);
  expect(Array.isArray(all.body)).toBe(true);
  expect(all.body).toHaveLength(bulkSize / 100);
});

// Solo el administrador ve la lista completa y la lista liviana para elegir jefe
test('la lista de usuarios y la de opciones son solo del administrador', async () => {
  expect((await employee.get('/user/all?page=1')).status).toBe(403);
  expect((await employee.get('/user/options')).status).toBe(403);
  const options = await admin.get('/user/options');
  expect(options.status).toBe(200);
  expect(options.body.length).toBeGreaterThanOrEqual(bulkSize);
  expect(Object.keys(options.body[0]).sort()).toEqual(['Rol', 'activo', 'apellido_paterno', 'email_corporativo', 'id_usuario', 'nombre']);
});

// Cargos y secciones tambien se piden de a una pagina y se buscan por nombre o codigo
test('pagina y busca cargos y secciones', async () => {
  const sections = await admin.get('/section?page=1&limit=10');
  expect(sections.body.items).toHaveLength(10);
  expect(sections.body.total).toBeGreaterThan(10);
  const byCode = await admin.get('/section?page=1&search=837');
  expect(byCode.body.items.map((section) => section.codigo_seccion)).toContain('837');
  const byName = await admin.get('/section?page=1&search=administración');
  expect(byName.body.items.some((section) => section.nombre === 'ADMINISTRACION')).toBe(true);
  const positions = await admin.get('/position?page=1&limit=2');
  expect(positions.body.items).toHaveLength(2);
  expect(positions.body.items[0].Escala_Viatico).toBeDefined();
  const fullPositions = await admin.get('/position');
  expect(Array.isArray(fullPositions.body)).toBe(true);
  expect(positions.body.total).toBe(fullPositions.body.length);
});
