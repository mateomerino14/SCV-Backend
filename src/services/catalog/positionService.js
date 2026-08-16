const supabase = require('../../config/supabase')
const textNormalizer = require('../../utils/textNormalizer')

// Normaliza el nombre de un cargo para comparacion sin acentos ni espacios extra
const normalizePositionName = (name) => {
  return textNormalizer.normalizeText(name || '').replace(/\s+/g, ' ')
};

// Verifica que no exista otro cargo con el mismo nombre normalizado
const validatePositionNotDuplicated = async (name, excludeId) => {
  if (!name || !name.trim()) {
    return null
  }
  const normalizedName = normalizePositionName(name)
  let query = supabase.from('Cargo').select('id_cargo, nombre')
  if (excludeId) {
    query = query.neq('id_cargo', excludeId)
  }
  const {data, error} = await query
  if (error) {
    return null
  }
  const alreadyExists = (data || []).some((position) => normalizePositionName(position.nombre) === normalizedName)
  if (alreadyExists) {
    return `Ya existe un cargo con el nombre "${name.trim()}". No se permiten cargos duplicados.`
  }
  else {
    return null
  }
};

module.exports = {normalizePositionName, validatePositionNotDuplicated};