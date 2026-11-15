const supabase = require('../../config/supabase');
const {countryClassOf} = require('../../utils/countryClasses');

const scaleTypes = ['A', 'B', 'C'];
const amountFields = ['monto_interior', 'monto_clase_1_usd', 'monto_clase_2_usd'];
const maxAmount = 99999999;

// Indica si el tipo es uno de la escala (A, B o C)
const isScaleType = (type) => scaleTypes.includes(type);

// Devuelve la escala de viaticos ordenada de C a A
const getScale = async () => {
  const {data, error} = await supabase.from('Escala_Viatico').select('*').order('tipo', {ascending: false});
  if (error) {
    return {error: error.message, status: 500};
  }
  return {scale: data};
};

// Toma de la peticion solo los montos, el hospedaje y la descripcion validos de un tipo de la escala
const pickScaleFields = (body) => {
  const fields = {};
  for (const field of amountFields) {
    if (body[field] === undefined) {
      continue;
    }
    const value = Number(body[field]);
    if (body[field] === '' || body[field] === null || !Number.isFinite(value) || value < 0 || value > maxAmount) {
      return {error: 'Los montos de la escala deben ser números mayores o iguales a cero'};
    }
    fields[field] = Math.round(value * 100) / 100;
  }
  if (body.hospedaje !== undefined) {
    const lodging = String(body.hospedaje || '').trim();
    if (!lodging || lodging.length > 40) {
      return {error: 'El hospedaje es requerido y no puede superar los 40 caracteres'};
    }
    fields.hospedaje = lodging;
  }
  if (body.descripcion !== undefined) {
    const description = String(body.descripcion || '').trim();
    if (!description || description.length > 100) {
      return {error: 'La descripción es requerida y no puede superar los 100 caracteres'};
    }
    fields.descripcion = description;
  }
  return {fields};
};

// Actualiza los montos, el hospedaje o la descripcion de un tipo de la escala; los viajes ya guardados conservan su tarifa
const updateScale = async (type, body) => {
  if (!isScaleType(type)) {
    return {error: 'El tipo de la escala debe ser A, B o C', status: 400};
  }
  const picked = pickScaleFields(body || {});
  if (picked.error) {
    return {error: picked.error, status: 400};
  }
  if (Object.keys(picked.fields).length === 0) {
    return {error: 'No hay datos para actualizar', status: 400};
  }
  const {data, error} = await supabase.from('Escala_Viatico').update(picked.fields).eq('tipo', type).select().single();
  if (error) {
    return {error: error.message, status: 500};
  }
  return {scale: data};
};

// Calcula las tarifas diarias que se guardan en el viaje segun el tipo del cargo del empleado y la clase del pais
const tripRatesFor = async (userId, tripType, country) => {
  let countryClass = null;
  if (tripType === 'Internacional') {
    countryClass = countryClassOf(country);
    if (!countryClass) {
      return {error: 'Elige el país de destino de la lista', status: 400};
    }
  }
  const {data: user} = await supabase.from('Usuario').select('Cargo(tipo_viatico, Escala_Viatico(*))').eq('id_usuario', userId).single();
  const scale = user?.Cargo?.Escala_Viatico;
  if (!scale) {
    return {error: 'Tu cargo no tiene un tipo de la escala de viáticos; pide al administrador que lo asigne', status: 400};
  }
  let dailyRateUsd = 0;
  if (countryClass === 1) {
    dailyRateUsd = scale.monto_clase_1_usd;
  }
  else if (countryClass === 2) {
    dailyRateUsd = scale.monto_clase_2_usd;
  }
  let destinationCountry = null;
  if (countryClass) {
    destinationCountry = country;
  }
  return {rates: {pais_destino: destinationCountry, clase_pais: countryClass, tarifa_diaria: scale.monto_interior, tarifa_diaria_usd: dailyRateUsd}};
};

module.exports = {isScaleType, getScale, updateScale, tripRatesFor};
