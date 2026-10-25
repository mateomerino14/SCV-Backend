jest.mock('../../src/config/supabase', () => ({}));
jest.mock('../../src/services/shared/emailService', () => ({}));
const {validateImportRows} = require('../../src/services/user/userImportService');
const textNormalizer = require('../../src/utils/textNormalizer');

const key = (text) => textNormalizer.normalizeText(text);

// Sistema con un usuario, dos cargos, una seccion y los cinco roles
const context = {
  emails: new Set([key('ana.lopez@maxam.com')]),
  idCards: new Set([key('5555555')]),
  usersByEmail: new Map([['jefe.planta@maxam.com', {id_usuario: 7}], ['ana.lopez@maxam.com', {id_usuario: 8}]]),
  positions: new Map([[key('Operador de planta'), {id_cargo: 1, nombre: 'Operador de planta'}], [key('Gerente RRHH'), {id_cargo: 2, nombre: 'Gerente RRHH'}]]),
  sections: new Map([[key('Producción'), {id_seccion: 3, nombre: 'Producción'}]]),
  roles: new Map([['EMPLEADO', {id_rol: 3, nombre: 'EMPLEADO'}], ['SUPERVISOR', {id_rol: 2, nombre: 'SUPERVISOR'}], ['REVISOR', {id_rol: 4, nombre: 'REVISOR'}]]),
  uniqueRoleIds: new Set([4, 5]),
  takenRoleIds: new Set([4]),
  uniquePositionKeys: new Set([key('Gerente RRHH')]),
  takenPositionKeys: new Set(),
};

const row = (fila, extra = {}) => ({
  fila, nombre: 'Juan', apellido_paterno: 'Pérez', email_corporativo: `juan${fila}@maxam.com`, cargo: 'operador de planta', seccion: 'PRODUCCION', ...extra,
});

// Una fila completa queda lista con sus ids resueltos y el rol por defecto
test('acepta una fila valida y resuelve cargo, seccion, rol y jefe del sistema', () => {
  const [result] = validateImportRows([row(2, {correo_jefe: 'Jefe.Planta@maxam.com', telefono: '71234567'})], context);
  expect(result.errores).toEqual([]);
  expect(result.payload).toMatchObject({id_cargo: 1, id_seccion: 3, id_rol: 3, id_jefe_directo: 7, telefono: '71234567'});
});

// Correo o CI ya registrados, o repetidos en el archivo, no se importan
test('rechaza correos y CI que ya estan en el sistema o repetidos en el archivo', () => {
  const results = validateImportRows([
    row(2, {email_corporativo: 'ANA.LOPEZ@maxam.com'}),
    row(3, {email_corporativo: 'nuevo@maxam.com', carnet_identidad: '123'}),
    row(4, {email_corporativo: 'nuevo@maxam.com', carnet_identidad: '123'}),
    row(5, {carnet_identidad: '5555555'}),
  ], context);
  expect(results[0].errores).toContain('Ya existe un usuario con ese correo en el sistema');
  expect(results[1].errores).toContain('Correo repetido en el archivo (también en la fila 4)');
  expect(results[2].errores).toContain('CI repetido en el archivo (también en la fila 3)');
  expect(results[3].errores).toContain('Ya existe un usuario con ese CI en el sistema');
});

// Campos obligatorios, formatos y catalogos inexistentes
test('marca campos faltantes, formatos invalidos y catalogos que no existen', () => {
  const [result] = validateImportRows([{fila: 2, nombre: 'Juan2', email_corporativo: 'correo-malo', telefono: '12', cargo: 'Chofer', seccion: 'Ventas', rol: 'jefe', codigo_dependencia: '42'}], context);
  expect(result.errores).toEqual(expect.arrayContaining([
    'El nombre solo puede tener letras', 'Falta el apellido paterno', 'El correo no es válido', 'El teléfono debe tener 7 u 8 números',
    'La dependencia de Oracle debe tener 3 dígitos', 'El cargo "Chofer" no existe o está suspendido', 'La sección "Ventas" no existe o está suspendida',
  ]));
  expect(result.errores.some((error) => error.startsWith('El rol "JEFE" no existe'))).toBe(true);
});

// Rol y cargo unicos: ocupados en el sistema o repetidos en el archivo
test('respeta los roles y cargos que solo puede tener una persona', () => {
  const results = validateImportRows([row(2, {rol: 'revisor'}), row(3, {cargo: 'Gerente RRHH'}), row(4, {cargo: 'Gerente RRHH'})], context);
  expect(results[0].errores[0]).toContain('Ya hay un usuario activo con el rol REVISOR');
  expect(results[1].errores[0]).toContain('está en las filas 3, 4');
});

// El jefe puede venir en el mismo archivo; si su fila falla, la del subordinado tambien
test('toma al jefe de otra fila del archivo y arrastra sus errores', () => {
  const results = validateImportRows([
    row(2, {email_corporativo: 'jefa@maxam.com'}),
    row(3, {correo_jefe: 'jefa@maxam.com'}),
    row(4, {email_corporativo: 'malo@maxam.com', cargo: 'Inexistente'}),
    row(5, {correo_jefe: 'malo@maxam.com'}),
    row(6, {correo_jefe: 'nadie@maxam.com'}),
  ], context);
  expect(results[1].errores).toEqual([]);
  expect(results[1].jefeEnArchivo).toBe(2);
  expect(results[3].errores).toContain('Su jefe directo (fila 4) tiene errores');
  expect(results[4].errores[0]).toContain('No se encontró al jefe directo nadie@maxam.com');
});

// Dos personas que se ponen como jefe una de la otra no se pueden crear
test('detecta jefes que forman un ciclo', () => {
  const results = validateImportRows([
    row(2, {email_corporativo: 'a@maxam.com', correo_jefe: 'b@maxam.com'}),
    row(3, {email_corporativo: 'b@maxam.com', correo_jefe: 'a@maxam.com'}),
  ], context);
  expect(results[0].errores).toContain('Los jefes directos forman un ciclo dentro del archivo');
  expect(results[1].errores).toContain('Los jefes directos forman un ciclo dentro del archivo');
});
