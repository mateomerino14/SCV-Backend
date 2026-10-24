const supabase = require('../../config/supabase');
const textNormalizer = require('../../utils/textNormalizer');

// Normaliza el nombre de una seccion para comparacion sin acentos ni espacios extra
const normalizeSectionName = (name) => {
  return textNormalizer.normalizeText(name || '').replace(/\s+/g, ' ');
};

// Verifica que no exista otra seccion con el mismo nombre normalizado
const validateSectionNotDuplicated = async (name, excludeId) => {
  if (!name || !name.trim()) {
    return null;
  }
  const normalizedName = normalizeSectionName(name);
  let query = supabase.from('Seccion').select('id_seccion, nombre');
  if (excludeId) {
    query = query.neq('id_seccion', excludeId);
  }
  const {data, error} = await query;
  if (error) {
    return null;
  }
  const alreadyExists = (data || []).some((section) => normalizeSectionName(section.nombre) === normalizedName);
  if (alreadyExists) {
    return `Ya existe una sección con el nombre "${name.trim()}". No se permiten secciones duplicadas.`;
  }
  else {
    return null;
  }
};

// Valida los codigos de Oracle de la seccion: vacios o de 3 digitos
const validateOracleCodes = (body) => {
  const codes = [['codigo_dependencia', 'dependencia'], ['codigo_seccion', 'sección']];
  for (const [field, label] of codes) {
    const value = body[field];
    if (value !== undefined && value !== null && value !== '' && !/^\d{3}$/.test(String(value))) {
      return `El código de ${label} de Oracle debe tener 3 dígitos`;
    }
  }
  return null;
};

// Deja solo los campos editables de una seccion, con los codigos vacios como null
const pickSectionFields = (body) => {
  const fields = {};
  ['nombre', 'activo', 'codigo_dependencia', 'codigo_seccion'].forEach((field) => {
    if (body[field] !== undefined) {
      fields[field] = body[field];
    }
  });
  ['codigo_dependencia', 'codigo_seccion'].forEach((field) => {
    if (fields[field] === '') {
      fields[field] = null;
    }
  });
  return fields;
};

module.exports = {validateSectionNotDuplicated, validateOracleCodes, pickSectionFields};
