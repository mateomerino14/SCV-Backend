const bcrypt = require('bcrypt');
const supabase = require('../../config/supabase');
const textNormalizer = require('../../utils/textNormalizer');
const userService = require('./userService');

const saltRounds = 10;
const maxRows = 500;
const maxNameLength = 30;
const maxEmailLength = 100;
const maxIdCardLength = 15;
const defaultRoleName = 'EMPLEADO';
const emailConcurrency = 5;
const onlyLetters = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9]{7,8}$/;
const dependencyPattern = /^\d{3}$/;
const importedColumns = 'id_usuario, nombre, apellido_paterno, email_corporativo';

const textOf = (value) => String(value ?? '').trim();
const keyOf = (value) => textNormalizer.normalizeText(textOf(value));

// Limpia una fila del Excel: textos sin espacios de mas y correos en minusculas
const cleanRow = (row, index) => ({
  fila: parseInt(row.fila, 10) || index + 2,
  nombre: textOf(row.nombre),
  apellido_paterno: textOf(row.apellido_paterno),
  apellido_materno: textOf(row.apellido_materno),
  email_corporativo: textOf(row.email_corporativo).toLowerCase(),
  carnet_identidad: textOf(row.carnet_identidad),
  telefono: textOf(row.telefono),
  cargo: textOf(row.cargo),
  seccion: textOf(row.seccion),
  rol: textOf(row.rol).toUpperCase(),
  correo_jefe: textOf(row.correo_jefe).toLowerCase(),
  codigo_dependencia: textOf(row.codigo_dependencia),
});

// Valida un nombre o apellido: obligatorio o no, solo letras y hasta 30 caracteres
const checkName = (value, label, required, errors) => {
  if (!value) {
    if (required) {
      errors.push(`Falta el ${label}`);
    }
    return;
  }
  if (!onlyLetters.test(value)) {
    errors.push(`El ${label} solo puede tener letras`);
  }
  else if (value.length > maxNameLength) {
    errors.push(`El ${label} tiene más de ${maxNameLength} caracteres`);
  }
};

// Revisa el formato de los campos de una fila, sin mirar la base
const checkFormats = (row, errors) => {
  checkName(row.nombre, 'nombre', true, errors);
  checkName(row.apellido_paterno, 'apellido paterno', true, errors);
  checkName(row.apellido_materno, 'apellido materno', false, errors);
  if (!row.email_corporativo) {
    errors.push('Falta el correo');
  }
  else if (!emailPattern.test(row.email_corporativo) || row.email_corporativo.length > maxEmailLength) {
    errors.push('El correo no es válido');
  }
  if (row.telefono && !phonePattern.test(row.telefono)) {
    errors.push('El teléfono debe tener 7 u 8 números');
  }
  if (row.carnet_identidad.length > maxIdCardLength) {
    errors.push(`El CI tiene más de ${maxIdCardLength} caracteres`);
  }
  if (row.codigo_dependencia && !dependencyPattern.test(row.codigo_dependencia)) {
    errors.push('La dependencia de Oracle debe tener 3 dígitos');
  }
};

// Cuenta en cuantas filas aparece cada valor, para detectar repetidos dentro del archivo
const countBy = (rows, field) => {
  const counts = {};
  rows.forEach((row) => {
    const value = keyOf(row[field]);
    if (value) {
      counts[value] = (counts[value] || []).concat(row.fila);
    }
  });
  return counts;
};

const otherRows = (rowsList, ownRow) => rowsList.filter((fila) => fila !== ownRow).join(', ');

// Revisa correo y CI contra el sistema y contra las demas filas del archivo
const checkDuplicates = (row, context, emailCounts, idCardCounts, errors) => {
  const emailKey = keyOf(row.email_corporativo);
  if (emailKey && context.emails.has(emailKey)) {
    errors.push('Ya existe un usuario con ese correo en el sistema');
  }
  if (emailKey && emailCounts[emailKey]?.length > 1) {
    errors.push(`Correo repetido en el archivo (también en la fila ${otherRows(emailCounts[emailKey], row.fila)})`);
  }
  const idCardKey = keyOf(row.carnet_identidad);
  if (idCardKey && context.idCards.has(idCardKey)) {
    errors.push('Ya existe un usuario con ese CI en el sistema');
  }
  if (idCardKey && idCardCounts[idCardKey]?.length > 1) {
    errors.push(`CI repetido en el archivo (también en la fila ${otherRows(idCardCounts[idCardKey], row.fila)})`);
  }
};

// Busca cargo, seccion y rol por su nombre y deja sus ids en la fila
const resolveCatalogs = (row, context, errors) => {
  const position = context.positions.get(keyOf(row.cargo));
  if (!row.cargo) {
    errors.push('Falta el cargo');
  }
  else if (!position) {
    errors.push(`El cargo "${row.cargo}" no existe o está suspendido`);
  }
  let section = null;
  if (row.seccion) {
    section = context.sections.get(keyOf(row.seccion));
    if (!section) {
      errors.push(`La sección "${row.seccion}" no existe o está suspendida`);
    }
  }
  const roleName = row.rol || defaultRoleName;
  const role = context.roles.get(roleName);
  if (!role) {
    errors.push(`El rol "${row.rol}" no existe (use EMPLEADO, SUPERVISOR, APROBADOR, REVISOR o ADMINISTRADOR)`);
  }
  return {position, section, role};
};

// Roles y cargos que solo puede tener un usuario activo: no pueden estar ocupados ni repetirse en el archivo
const checkUniqueAssignments = (row, catalogs, context, roleCounts, positionCounts, errors) => {
  const {position, role} = catalogs;
  if (role && context.uniqueRoleIds.has(role.id_rol)) {
    if (context.takenRoleIds.has(role.id_rol)) {
      errors.push(`Ya hay un usuario activo con el rol ${role.nombre}; solo puede haber uno`);
    }
    if (roleCounts[role.id_rol]?.length > 1) {
      errors.push(`El rol ${role.nombre} solo puede tenerlo una persona y está en las filas ${roleCounts[role.id_rol].join(', ')}`);
    }
  }
  const positionKey = position && keyOf(position.nombre);
  if (positionKey && context.uniquePositionKeys.has(positionKey)) {
    if (context.takenPositionKeys.has(positionKey)) {
      errors.push(`Ya hay un usuario activo con el cargo "${position.nombre}"; solo puede haber uno`);
    }
    if (positionCounts[positionKey]?.length > 1) {
      errors.push(`El cargo "${position.nombre}" solo puede tenerlo una persona y está en las filas ${positionCounts[positionKey].join(', ')}`);
    }
  }
};

// Cuenta las filas que piden cada rol y cargo unico
const countUniqueAssignments = (rows, context) => {
  const roleCounts = {};
  const positionCounts = {};
  rows.forEach((row) => {
    const role = context.roles.get(row.rol || defaultRoleName);
    if (role && context.uniqueRoleIds.has(role.id_rol)) {
      roleCounts[role.id_rol] = (roleCounts[role.id_rol] || []).concat(row.fila);
    }
    const position = context.positions.get(keyOf(row.cargo));
    const positionKey = position && keyOf(position.nombre);
    if (positionKey && context.uniquePositionKeys.has(positionKey)) {
      positionCounts[positionKey] = (positionCounts[positionKey] || []).concat(row.fila);
    }
  });
  return {roleCounts, positionCounts};
};

// Arma los datos que se guardan del usuario
const buildPayload = (row, catalogs) => ({
  nombre: row.nombre,
  apellido_paterno: row.apellido_paterno,
  apellido_materno: row.apellido_materno || null,
  email_corporativo: row.email_corporativo,
  carnet_identidad: row.carnet_identidad || null,
  telefono: row.telefono || null,
  codigo_dependencia: row.codigo_dependencia || null,
  id_cargo: catalogs.position?.id_cargo,
  id_seccion: catalogs.section?.id_seccion || null,
  id_rol: catalogs.role?.id_rol,
  activo: true,
});

// El jefe directo puede estar en el sistema o en otra fila del archivo; si su fila tiene errores, esta tampoco se crea
const resolveBosses = (results, context) => {
  const byEmail = new Map(results.map((result) => [result.email_corporativo, result]));
  results.forEach((result) => {
    const bossEmail = result.correo_jefe;
    if (!bossEmail) {
      return;
    }
    if (bossEmail === result.email_corporativo) {
      result.errores.push('El jefe directo no puede ser la misma persona');
      return;
    }
    const systemBoss = context.usersByEmail.get(bossEmail);
    if (systemBoss) {
      result.payload.id_jefe_directo = systemBoss.id_usuario;
      return;
    }
    const fileBoss = byEmail.get(bossEmail);
    if (!fileBoss) {
      result.errores.push(`No se encontró al jefe directo ${bossEmail} ni en el sistema ni en el archivo`);
      return;
    }
    result.jefeEnArchivo = fileBoss.fila;
  });
  const byRow = new Map(results.map((result) => [result.fila, result]));
  results.forEach((result) => {
    const visited = new Set([result.fila]);
    let current = byRow.get(result.jefeEnArchivo);
    while (current) {
      if (visited.has(current.fila)) {
        result.errores.push('Los jefes directos forman un ciclo dentro del archivo');
        return;
      }
      visited.add(current.fila);
      current = byRow.get(current.jefeEnArchivo);
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    results.forEach((result) => {
      if (!result.jefeEnArchivo || result.errores.length > 0) {
        return;
      }
      const boss = results.find((other) => other.fila === result.jefeEnArchivo);
      if (boss.errores.length > 0) {
        result.errores.push(`Su jefe directo (fila ${boss.fila}) tiene errores`);
        changed = true;
      }
    });
  }
};

// Valida todas las filas del archivo contra el sistema; no guarda nada
const validateImportRows = (rawRows, context) => {
  const rows = rawRows.map(cleanRow);
  const emailCounts = countBy(rows, 'email_corporativo');
  const idCardCounts = countBy(rows, 'carnet_identidad');
  const {roleCounts, positionCounts} = countUniqueAssignments(rows, context);
  const results = rows.map((row) => {
    const errors = [];
    checkFormats(row, errors);
    checkDuplicates(row, context, emailCounts, idCardCounts, errors);
    const catalogs = resolveCatalogs(row, context, errors);
    checkUniqueAssignments(row, catalogs, context, roleCounts, positionCounts, errors);
    return {
      fila: row.fila,
      nombre: `${row.nombre} ${row.apellido_paterno}`.trim(),
      email_corporativo: row.email_corporativo,
      cargo: catalogs.position?.nombre || row.cargo,
      rol: catalogs.role?.nombre || row.rol,
      correo_jefe: row.correo_jefe,
      jefeEnArchivo: null,
      errores: errors,
      payload: buildPayload(row, catalogs),
    };
  });
  resolveBosses(results, context);
  return results;
};

// Carga usuarios, cargos, secciones y roles para validar el archivo
const loadContext = async () => {
  const [users, positions, sections, roles] = await Promise.all([
    supabase.from('Usuario').select('id_usuario, email_corporativo, carnet_identidad, id_rol, activo, Cargo(nombre)'),
    supabase.from('Cargo').select('id_cargo, nombre').eq('activo', true),
    supabase.from('Seccion').select('id_seccion, nombre').eq('activo', true),
    supabase.from('Rol').select('id_rol, nombre'),
  ]);
  const failed = [users, positions, sections, roles].find((result) => result.error);
  if (failed) {
    return {error: failed.error.message};
  }
  const activeUsers = users.data.filter((user) => user.activo);
  return {
    emails: new Set(users.data.map((user) => keyOf(user.email_corporativo))),
    idCards: new Set(users.data.map((user) => keyOf(user.carnet_identidad)).filter(Boolean)),
    usersByEmail: new Map(users.data.map((user) => [textOf(user.email_corporativo).toLowerCase(), user])),
    positions: new Map(positions.data.map((position) => [keyOf(position.nombre), position])),
    sections: new Map(sections.data.map((section) => [keyOf(section.nombre), section])),
    roles: new Map(roles.data.map((role) => [role.nombre.toUpperCase(), role])),
    uniqueRoleIds: new Set(userService.uniqueRoles.map((role) => role.id)),
    takenRoleIds: new Set(activeUsers.map((user) => user.id_rol)),
    uniquePositionKeys: new Set(userService.uniquePositionsNormalized),
    takenPositionKeys: new Set(activeUsers.map((user) => keyOf(user.Cargo?.nombre))),
  };
};

// Resumen de la validacion que ve el administrador, sin los datos internos
const toPreview = (results) => results.map(({payload, jefeEnArchivo, ...visible}) => ({...visible, valido: visible.errores.length === 0}));

// Revisa que el archivo traiga filas y no pase del maximo
const checkRowsInput = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {error: 'El archivo no tiene filas para importar', status: 400};
  }
  if (rows.length > maxRows) {
    return {error: `El archivo tiene ${rows.length} filas; el máximo por importación es ${maxRows}`, status: 400};
  }
  return null;
};

// Valida el archivo y devuelve fila por fila lo que se crearia y lo que tiene errores
const previewImport = async (rows) => {
  const inputError = checkRowsInput(rows);
  if (inputError) {
    return inputError;
  }
  const context = await loadContext();
  if (context.error) {
    return {error: context.error, status: 500};
  }
  return {filas: toPreview(validateImportRows(rows, context))};
};

// Guarda un grupo de usuarios; si el grupo falla, los intenta de a uno para no perder los buenos
const insertGroup = async (group) => {
  const {data, error} = await supabase.from('Usuario').insert(group.map((item) => item.record)).select(importedColumns);
  if (!error) {
    return {created: data, failed: []};
  }
  const created = [];
  const failed = [];
  for (const item of group) {
    const single = await supabase.from('Usuario').insert(item.record).select(importedColumns);
    if (single.error) {
      let message = single.error.message;
      if (single.error.code === '23505') {
        message = 'Ya existe un usuario con ese correo en el sistema';
      }
      failed.push({fila: item.result.fila, errores: [message]});
    }
    else {
      created.push(single.data[0]);
    }
  }
  return {created, failed};
};

// Prepara el registro con la contrasenia temporal ya cifrada
const buildRecord = async (result, createdIds) => {
  const temporaryPassword = userService.generateTemporaryPassword();
  const record = {
    ...result.payload,
    contrasenia: await bcrypt.hash(temporaryPassword, saltRounds),
    debe_cambiar_contrasenia: true,
    motivo_cambio_contrasenia: 'TEMPORAL',
  };
  if (result.jefeEnArchivo) {
    record.id_jefe_directo = createdIds.get(result.jefeEnArchivo);
  }
  return {result, record, temporaryPassword};
};

// Envia los correos de bienvenida de a pocos para no saturar el servicio de correo
const sendWelcomeEmails = async (deliveries) => {
  for (let start = 0; start < deliveries.length; start += emailConcurrency) {
    const chunk = deliveries.slice(start, start + emailConcurrency);
    await Promise.all(chunk.map(({user, temporaryPassword}) => userService.sendWelcomeEmail(user, temporaryPassword)));
  }
};

// Crea por niveles: primero quienes no dependen de otra fila y despues sus subordinados
const createByLevels = async (validResults) => {
  const createdIds = new Map();
  const deliveries = [];
  const failed = [];
  let pending = validResults;
  while (pending.length > 0) {
    const ready = pending.filter((result) => !result.jefeEnArchivo || createdIds.has(result.jefeEnArchivo));
    if (ready.length === 0) {
      pending.forEach((result) => failed.push({fila: result.fila, errores: ['Su jefe directo no se pudo crear o los jefes forman un ciclo']}));
      break;
    }
    const group = await Promise.all(ready.map((result) => buildRecord(result, createdIds)));
    const {created, failed: groupFailed} = await insertGroup(group);
    failed.push(...groupFailed);
    created.forEach((user) => {
      const item = group.find((entry) => entry.record.email_corporativo === user.email_corporativo);
      createdIds.set(item.result.fila, user.id_usuario);
      deliveries.push({user, temporaryPassword: item.temporaryPassword});
    });
    const failedRows = new Set(groupFailed.map((item) => item.fila));
    pending = pending.filter((result) => !ready.includes(result) && !failedRows.has(result.jefeEnArchivo));
    validResults.filter((result) => failedRows.has(result.jefeEnArchivo)).forEach((result) => {
      failed.push({fila: result.fila, errores: [`Su jefe directo (fila ${result.jefeEnArchivo}) no se pudo crear`]});
    });
  }
  return {deliveries, failed};
};

// Vuelve a validar el archivo, crea solo las filas sin errores y manda a cada usuario su contrasenia temporal
const importUsers = async (rows) => {
  const inputError = checkRowsInput(rows);
  if (inputError) {
    return inputError;
  }
  const context = await loadContext();
  if (context.error) {
    return {error: context.error, status: 500};
  }
  const results = validateImportRows(rows, context);
  const validResults = results.filter((result) => result.errores.length === 0);
  const skipped = results.filter((result) => result.errores.length > 0).map(({fila, errores}) => ({fila, errores}));
  if (validResults.length === 0) {
    return {error: 'Ninguna fila se puede importar: corrige los errores del archivo', status: 400};
  }
  const {deliveries, failed} = await createByLevels(validResults);
  // Los correos salen en segundo plano para no hacer esperar al administrador
  sendWelcomeEmails(deliveries).catch((error) => console.warn('Error enviando correos de bienvenida:', error.message));
  return {creados: deliveries.length, omitidos: [...skipped, ...failed].sort((first, second) => first.fila - second.fila)};
};

module.exports = {validateImportRows, previewImport, importUsers, maxRows};
