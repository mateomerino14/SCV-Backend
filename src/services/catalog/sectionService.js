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

// Valida el codigo de Oracle de la seccion: vacio o de 3 digitos
const validateOracleCodes = (body) => {
  const value = body.codigo_seccion;
  if (value !== undefined && value !== null && value !== '' && !/^\d{3}$/.test(String(value))) {
    return 'El código de sección de Oracle debe tener 3 dígitos';
  }
  return null;
};

// Deja solo los campos editables de una seccion, con los codigos vacios como null
const pickSectionFields = (body) => {
  const fields = {};
  ['nombre', 'activo', 'codigo_seccion'].forEach((field) => {
    if (body[field] !== undefined) {
      fields[field] = body[field];
    }
  });
  if (fields.codigo_seccion === '') {
    fields.codigo_seccion = null;
  }
  return fields;
};

module.exports = {validateSectionNotDuplicated, validateOracleCodes, pickSectionFields};
