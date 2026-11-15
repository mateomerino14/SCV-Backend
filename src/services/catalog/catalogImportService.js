const supabase = require('../../config/supabase');
const textNormalizer = require('../../utils/textNormalizer');
const travelScaleService = require('./travelScaleService');

const maxRows = 500;
const maxNameLength = 100;
const sectionCodePattern = /^\d{3}$/;
const actions = {create: 'Crear', update: 'Actualizar', unchanged: 'Sin cambios'};

// Texto de una celda sin espacios de mas; vacio si no tiene nada
const textOf = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
// Clave para comparar nombres sin importar mayusculas, tildes ni signos
const keyOf = (value) => textNormalizer.normalizeText(textOf(value)).replace(/\s+/g, ' ');

// Traduce el estado del Excel: vacio no cambia nada, Activo o Suspendido
const statusOf = (value, errors) => {
  const key = keyOf(value);
  if (!key) {
    return undefined;
  }
  if (key === 'activo' || key === 'activa') {
    return true;
  }
  if (key === 'suspendido' || key === 'suspendida') {
    return false;
  }
  errors.push('El estado debe ser Activo o Suspendido');
  return undefined;
};

// Revisa el nombre: obligatorio y hasta 100 caracteres
const checkName = (name, label, errors) => {
  if (!name) {
    errors.push(`Falta el nombre de la ${label}`);
  }
  else if (name.length > maxNameLength) {
    errors.push(`El nombre tiene más de ${maxNameLength} caracteres`);
  }
};

// Limpia una fila de secciones: nombre y codigo de Oracle sin espacios de mas
const cleanSectionRow = (row) => ({nombre: textOf(row.nombre), codigo_seccion: textOf(row.codigo_seccion)});

// Revisa el formato de una seccion: codigo de 3 digitos y nombre
const checkSectionFormat = (row, errors) => {
  if (!sectionCodePattern.test(row.codigo_seccion)) {
    errors.push('La sección de Oracle debe tener 3 dígitos');
  }
  checkName(row.nombre, 'sección', errors);
};

// Claves que no se pueden repetir entre filas de secciones: el codigo y el nombre
const sectionFileKeys = (row) => [`codigo ${row.codigo_seccion}`, `nombre ${keyOf(row.nombre)}`];

// Busca la seccion guardada por su codigo; un nombre igual sin codigo se completa con el codigo del archivo
const matchSection = (row, existing) => {
  const byCode = existing.find((item) => item.codigo_seccion === row.codigo_seccion);
  const byName = existing.find((item) => keyOf(item.nombre) === keyOf(row.nombre));
  if (byCode && byName && byName.id_seccion !== byCode.id_seccion) {
    return {error: `El nombre ya lo usa la sección ${byName.codigo_seccion || 'sin código'}`};
  }
  if (byCode) {
    return {current: byCode};
  }
  if (byName && byName.codigo_seccion) {
    return {error: `Ya existe la sección "${byName.nombre}" con el código ${byName.codigo_seccion}`};
  }
  return {current: byName};
};

// Campos que se guardan de una seccion
const sectionFieldsOf = (row) => ({nombre: row.nombre, codigo_seccion: row.codigo_seccion});

// Limpia una fila de cargos: nombre sin espacios de mas y tipo en mayusculas
const cleanPositionRow = (row) => ({nombre: textOf(row.nombre), tipo_viatico: textOf(row.tipo_viatico).toUpperCase()});

// Revisa el formato de un cargo: nombre y tipo de la escala
const checkPositionFormat = (row, errors, context) => {
  checkName(row.nombre, 'cargo', errors);
  if (!context.scaleTypes.includes(row.tipo_viatico)) {
    errors.push(`El tipo de viático debe ser uno de la escala: ${context.scaleTypes.join(', ')}`);
  }
};

// Datos que necesita la revision de cargos: los tipos de la escala guardados
const loadPositionContext = async () => ({scaleTypes: await travelScaleService.getScaleTypes()});

// Clave que no se puede repetir entre filas de cargos: el nombre
const positionFileKeys = (row) => [`nombre ${keyOf(row.nombre)}`];

// Busca el cargo guardado con el mismo nombre, sin importar mayusculas ni tildes
const matchPosition = (row, existing) => ({current: existing.find((item) => keyOf(item.nombre) === keyOf(row.nombre))});

// Campos que se guardan de un cargo
const positionFieldsOf = (row) => ({nombre: row.nombre, tipo_viatico: row.tipo_viatico});

const sectionCatalog = {
  table: 'Seccion', idField: 'id_seccion', columns: 'id_seccion, nombre, codigo_seccion, activo',
  clean: cleanSectionRow, checkFormat: checkSectionFormat, fileKeys: sectionFileKeys, match: matchSection, fieldsOf: sectionFieldsOf,
};

const positionCatalog = {
  table: 'Cargo', idField: 'id_cargo', columns: 'id_cargo, nombre, tipo_viatico, activo',
  clean: cleanPositionRow, checkFormat: checkPositionFormat, loadContext: loadPositionContext, fileKeys: positionFileKeys, match: matchPosition, fieldsOf: positionFieldsOf,
};

const catalogs = {section: sectionCatalog, position: positionCatalog};

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

// Campos que cambian respecto a lo guardado; vacio si la fila no cambia nada
const changedFields = (fields, current) => {
  const changes = {};
  Object.entries(fields).forEach(([field, value]) => {
    if (value !== undefined && value !== current[field]) {
      changes[field] = value;
    }
  });
  return changes;
};

// Valida cada fila contra el archivo y lo guardado, y decide si se crea, se actualiza o no cambia
const validateRows = (catalog, rows, existing, context) => {
  const seen = new Map();
  return rows.map((rawRow, index) => {
    const errors = [];
    const row = {fila: parseInt(rawRow.fila, 10) || index + 2, ...catalog.clean(rawRow)};
    const active = statusOf(rawRow.estado, errors);
    catalog.checkFormat(row, errors, context);
    catalog.fileKeys(row).forEach((key) => {
      if (seen.has(key)) {
        errors.push(`Se repite con la fila ${seen.get(key)}`);
      }
      else {
        seen.set(key, row.fila);
      }
    });
    let action = actions.create;
    let current = null;
    let changes = {...catalog.fieldsOf(row), activo: active ?? true};
    if (errors.length === 0) {
      const matched = catalog.match(row, existing);
      if (matched.error) {
        errors.push(matched.error);
      }
      else if (matched.current) {
        current = matched.current;
        changes = changedFields({...catalog.fieldsOf(row), activo: active}, current);
        action = actions.update;
        if (Object.keys(changes).length === 0) {
          action = actions.unchanged;
        }
      }
    }
    return {...row, estado: textOf(rawRow.estado), accion: action, errores: [...new Set(errors)], valido: errors.length === 0, current, changes};
  });
};

// Quita los datos internos de cada fila antes de mostrarla
const toPreview = (results) => results.map(({current, changes, ...row}) => row);

// Carga lo guardado y valida el archivo de un catalogo
const validateCatalogFile = async (catalog, rows) => {
  const inputError = checkRowsInput(rows);
  if (inputError) {
    return inputError;
  }
  const {data, error} = await supabase.from(catalog.table).select(catalog.columns);
  if (error) {
    return {error: error.message, status: 500};
  }
  let context = {};
  if (catalog.loadContext) {
    context = await catalog.loadContext();
  }
  return {results: validateRows(catalog, rows, data || [], context)};
};

// Valida el archivo y devuelve fila por fila lo que se crearia, se actualizaria o tiene errores
const previewImport = async (catalogName, rows) => {
  const validated = await validateCatalogFile(catalogs[catalogName], rows);
  if (validated.error) {
    return validated;
  }
  return {filas: toPreview(validated.results)};
};

// Vuelve a validar el archivo y guarda solo las filas correctas: crea las nuevas y actualiza las que cambian
const importRows = async (catalogName, rows) => {
  const catalog = catalogs[catalogName];
  const validated = await validateCatalogFile(catalog, rows);
  if (validated.error) {
    return validated;
  }
  const omitted = validated.results.filter((result) => !result.valido).map((result) => ({fila: result.fila, errores: result.errores}));
  const toCreate = validated.results.filter((result) => result.valido && result.accion === actions.create);
  const toUpdate = validated.results.filter((result) => result.valido && result.accion === actions.update);
  let created = 0;
  if (toCreate.length > 0) {
    const {data, error} = await supabase.from(catalog.table).insert(toCreate.map((result) => result.changes)).select(catalog.idField);
    if (error) {
      toCreate.forEach((result) => omitted.push({fila: result.fila, errores: [error.message]}));
    }
    else {
      created = data.length;
    }
  }
  let updated = 0;
  for (const result of toUpdate) {
    const {error} = await supabase.from(catalog.table).update(result.changes).eq(catalog.idField, result.current[catalog.idField]);
    if (error) {
      omitted.push({fila: result.fila, errores: [error.message]});
    }
    else {
      updated += 1;
    }
  }
  const unchanged = validated.results.filter((result) => result.valido && result.accion === actions.unchanged).length;
  return {creados: created, actualizados: updated, sinCambios: unchanged, omitidos: omitted.sort((first, second) => first.fila - second.fila)};
};

module.exports = {previewImport, importRows};
