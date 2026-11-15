const supabase = require('../../config/supabase');
const {countryClassOf} = require('../../utils/countryClasses');

const scaleTypePattern = /^[A-Z]$/;
const amountFields = ['monto_interior', 'monto_clase_1_usd', 'monto_clase_2_usd'];
const maxAmount = 99999999;

// Devuelve las letras de los tipos guardados en la escala, en orden alfabetico
const getScaleTypes = async () => {
  const {data} = await supabase.from('Escala_Viatico').select('tipo').order('tipo', {ascending: true});
  return (data || []).map((row) => row.tipo);
};

// Devuelve la escala de viaticos, del tipo con mayor tarifa al de menor, con cuantos cargos usan cada tipo
const getScale = async () => {
  const {data, error} = await supabase.from('Escala_Viatico').select('*, Cargo(count)')
    .order('monto_interior', {ascending: false}).order('tipo', {ascending: false});
  if (error) {
    return {error: error.message, status: 500};
  }
  return {scale: data.map(({Cargo, ...row}) => ({...row, cargos: Cargo?.[0]?.count || 0}))};
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

// Crea un tipo nuevo de la escala con su letra, sus montos, el hospedaje y la descripcion
const createScale = async (body) => {
  const type = String(body?.tipo || '').trim().toUpperCase();
  if (!scaleTypePattern.test(type)) {
    return {error: 'El tipo debe ser una sola letra, de la A a la Z', status: 400};
  }
  const required = [...amountFields, 'hospedaje', 'descripcion'];
  const picked = pickScaleFields(Object.fromEntries(required.map((field) => [field, body[field] ?? ''])));
  if (picked.error) {
    return {error: picked.error, status: 400};
  }
  const existingTypes = await getScaleTypes();
  if (existingTypes.includes(type)) {
    return {error: `Ya existe el tipo ${type} en la escala`, status: 400};
  }
  const {data, error} = await supabase.from('Escala_Viatico').insert({tipo: type, ...picked.fields}).select().single();
  if (error) {
    return {error: error.message, status: 500};
  }
  return {scale: data};
};

// Actualiza los montos, el hospedaje o la descripcion de un tipo de la escala; los viajes ya guardados conservan su tarifa
const updateScale = async (type, body) => {
  if (!scaleTypePattern.test(type)) {
    return {error: 'El tipo debe ser una sola letra, de la A a la Z', status: 400};
  }
  const picked = pickScaleFields(body || {});
  if (picked.error) {
    return {error: picked.error, status: 400};
  }
  if (Object.keys(picked.fields).length === 0) {
    return {error: 'No hay datos para actualizar', status: 400};
  }
  const {data, error} = await supabase.from('Escala_Viatico').update(picked.fields).eq('tipo', type).select().maybeSingle();
  if (error) {
    return {error: error.message, status: 500};
  }
  if (!data) {
    return {error: `No existe el tipo ${type} en la escala`, status: 404};
  }
  return {scale: data};
};

// Elimina un tipo de la escala solo si ningun cargo lo usa y no es el ultimo que queda
const deleteScale = async (type) => {
  const existingTypes = await getScaleTypes();
  if (!existingTypes.includes(type)) {
    return {error: `No existe el tipo ${type} en la escala`, status: 404};
  }
  if (existingTypes.length === 1) {
    return {error: 'La escala debe tener al menos un tipo', status: 400};
  }
  const {count} = await supabase.from('Cargo').select('id_cargo', {count: 'exact', head: true}).eq('tipo_viatico', type);
  if (count > 0) {
    return {error: `El tipo ${type} lo usan ${count} cargo(s); cámbiales el tipo antes de eliminarlo`, status: 400};
  }
  const {error} = await supabase.from('Escala_Viatico').delete().eq('tipo', type);
  if (error) {
    return {error: error.message, status: 500};
  }
  return {deleted: type};
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

module.exports = {getScaleTypes, getScale, createScale, updateScale, deleteScale, tripRatesFor};
