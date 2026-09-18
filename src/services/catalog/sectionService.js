const supabase = require('../../config/supabase')
const textNormalizer = require('../../utils/textNormalizer')

// Normaliza el nombre de una seccion para comparacion sin acentos ni espacios extra
const normalizeSectionName = (name) => {
  return textNormalizer.normalizeText(name || '').replace(/\s+/g, ' ')
};

// Verifica que no exista otra seccion con el mismo nombre normalizado
const validateSectionNotDuplicated = async (name, excludeId) => {
  if (!name || !name.trim()) {
    return null
  }
  const normalizedName = normalizeSectionName(name)
  let query = supabase.from('Seccion').select('id_seccion, nombre')
  if (excludeId) {
    query = query.neq('id_seccion', excludeId)
  }
  const {data, error} = await query
  if (error) {
    return null
  }
  const alreadyExists = (data || []).some((section) => normalizeSectionName(section.nombre) === normalizedName)
  if (alreadyExists) {
    return `Ya existe una sección con el nombre "${name.trim()}". No se permiten secciones duplicadas.`
  }
  else {
    return null
  }
};

module.exports = {normalizeSectionName, validateSectionNotDuplicated};
