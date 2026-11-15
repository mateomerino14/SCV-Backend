const supabase = require('../../config/supabase');
const textNormalizer = require('../../utils/textNormalizer');
const travelScaleService = require('./travelScaleService');

// Normaliza el nombre de un cargo para comparacion sin acentos ni espacios extra
const normalizePositionName = (name) => {
  return textNormalizer.normalizeText(name || '').replace(/\s+/g, ' ');
};

// Verifica que no exista otro cargo con el mismo nombre normalizado
const validatePositionNotDuplicated = async (name, excludeId) => {
  if (!name || !name.trim()) {
    return null;
  }
  const normalizedName = normalizePositionName(name);
  let query = supabase.from('Cargo').select('id_cargo, nombre');
  if (excludeId) {
    query = query.neq('id_cargo', excludeId);
  }
  const {data, error} = await query;
  if (error) {
    return null;
  }
  const alreadyExists = (data || []).some((position) => normalizePositionName(position.nombre) === normalizedName);
  if (alreadyExists) {
    return `Ya existe un cargo con el nombre "${name.trim()}". No se permiten cargos duplicados.`;
  }
  else {
    return null;
  }
};

// Toma de la peticion solo el nombre y el tipo de la escala del cargo, validados
const pickPositionFields = (body, isNew) => {
  const fields = {};
  if (isNew || body.nombre !== undefined) {
    const name = String(body.nombre || '').trim();
    if (!name || name.length > 100) {
      return {error: 'El nombre del cargo es requerido y no puede superar los 100 caracteres'};
    }
    fields.nombre = name;
  }
  if (isNew || body.tipo_viatico !== undefined) {
    if (!travelScaleService.isScaleType(body.tipo_viatico)) {
      return {error: 'Elige el tipo de la escala de viáticos del cargo: A, B o C'};
    }
    fields.tipo_viatico = body.tipo_viatico;
  }
  return {fields};
};

module.exports = {validatePositionNotDuplicated, pickPositionFields};