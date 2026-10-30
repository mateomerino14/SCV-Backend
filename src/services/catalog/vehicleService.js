const supabase = require('../../config/supabase');

// Estados en los que el viaje ocupa su vehiculo; al terminar el viaje (EN_REVISION) el vehiculo queda libre
const busyTripStates = ['EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'EN_REVISION_TESORERO', 'EN_CURSO'];
const maxPlateLength = 20;
const maxDescriptionLength = 100;

// Normaliza la placa: sin espacios sobrantes y en mayusculas
const normalizePlate = (plate) => String(plate || '').trim().replace(/\s+/g, ' ').toUpperCase();

// Valida los datos de un vehiculo y devuelve el mensaje de error o null
const validateVehicleData = (data) => {
  const plate = normalizePlate(data.placa);
  if (!plate) {
    return 'La placa del vehículo es requerida';
  }
  if (plate.length > maxPlateLength) {
    return `La placa no puede superar los ${maxPlateLength} caracteres`;
  }
  if (data.descripcion && String(data.descripcion).trim().length > maxDescriptionLength) {
    return `La descripción no puede superar los ${maxDescriptionLength} caracteres`;
  }
  return null;
};

// Arma los campos que se guardan de un vehiculo
const pickVehicleFields = (data) => ({placa: normalizePlate(data.placa), descripcion: String(data.descripcion || '').trim() || null});

// Viajes que hoy ocupan un vehiculo, con el empleado que lo lleva
const getBusyTrips = async () => {
  const {data} = await supabase
    .from('Viaje')
    .select('id_viaje, id_vehiculo, destino, fecha_inicio, fecha_fin, estado, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno)')
    .not('id_vehiculo', 'is', null)
    .in('estado', busyTripStates);
  return data || [];
};

// Lista todos los vehiculos con el viaje que los ocupa, para el administrador
const listVehicles = async () => {
  const {data, error} = await supabase.from('Vehiculo').select('*').order('placa', {ascending: true});
  if (error) {
    return {error: error.message, status: 500};
  }
  const busyTrips = await getBusyTrips();
  return {vehicles: data.map((vehicle) => ({...vehicle, viaje_actual: busyTrips.find((trip) => trip.id_vehiculo === vehicle.id_vehiculo) || null}))};
};

// Lista los vehiculos activos que estan libres; el del viaje que se edita cuenta como libre
const listAvailableVehicles = async (tripId) => {
  const {data, error} = await supabase.from('Vehiculo').select('id_vehiculo, placa, descripcion').eq('activo', true).order('placa', {ascending: true});
  if (error) {
    return {error: error.message, status: 500};
  }
  const busyTrips = (await getBusyTrips()).filter((trip) => String(trip.id_viaje) !== String(tripId || ''));
  return {vehicles: data.filter((vehicle) => !busyTrips.some((trip) => trip.id_vehiculo === vehicle.id_vehiculo))};
};

// Verifica que el vehiculo exista, este activo y libre; devuelve el vehiculo o el error
const checkVehicleAvailable = async (vehicleId, tripId) => {
  const {data: vehicle} = await supabase.from('Vehiculo').select('id_vehiculo, placa, activo').eq('id_vehiculo', vehicleId).maybeSingle();
  if (!vehicle || !vehicle.activo) {
    return {error: 'El vehículo elegido no existe o está suspendido'};
  }
  const busyTrips = (await getBusyTrips()).filter((trip) => trip.id_vehiculo === vehicle.id_vehiculo && String(trip.id_viaje) !== String(tripId || ''));
  if (busyTrips.length > 0) {
    return {error: `El vehículo ${vehicle.placa} está ocupado en otro viaje; elige otro`};
  }
  return {vehicle};
};

// Crea o actualiza un vehiculo validando que la placa no se repita
const saveVehicle = async (data, vehicleId = null) => {
  const validationError = validateVehicleData(data);
  if (validationError) {
    return {error: validationError, status: 400};
  }
  const fields = pickVehicleFields(data);
  let query = supabase.from('Vehiculo').select('id_vehiculo').ilike('placa', fields.placa);
  if (vehicleId) {
    query = query.neq('id_vehiculo', vehicleId);
  }
  const {data: duplicates} = await query.limit(1);
  if ((duplicates || []).length > 0) {
    return {error: `Ya existe un vehículo con la placa ${fields.placa}`, status: 400};
  }
  let request = supabase.from('Vehiculo').insert(fields);
  if (vehicleId) {
    request = supabase.from('Vehiculo').update(fields).eq('id_vehiculo', vehicleId);
  }
  const {data: saved, error} = await request.select().single();
  if (error) {
    return {error: error.message, status: 500};
  }
  return {vehicle: saved};
};

// Activa o suspende un vehiculo; uno ocupado en un viaje no se puede suspender
const setVehicleActive = async (vehicleId, active) => {
  if (!active) {
    const busyTrips = (await getBusyTrips()).filter((trip) => String(trip.id_vehiculo) === String(vehicleId));
    if (busyTrips.length > 0) {
      return {error: 'No se puede suspender un vehículo que está en un viaje', status: 400};
    }
  }
  const {data, error} = await supabase.from('Vehiculo').update({activo: active}).eq('id_vehiculo', vehicleId).select().single();
  if (error) {
    return {error: error.message, status: 500};
  }
  return {vehicle: data};
};

// Elimina un vehiculo que nunca se uso en un viaje; si ya se uso, se debe suspender
const deleteVehicle = async (vehicleId) => {
  const {count} = await supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('id_vehiculo', vehicleId);
  if (count > 0) {
    return {error: 'El vehículo ya se usó en viajes; suspéndelo en lugar de eliminarlo', status: 400};
  }
  const {error} = await supabase.from('Vehiculo').delete().eq('id_vehiculo', vehicleId);
  if (error) {
    return {error: error.message, status: 500};
  }
  return {message: 'Vehículo eliminado'};
};

module.exports = {busyTripStates, listVehicles, listAvailableVehicles, checkVehicleAvailable, saveVehicle, setVehicleActive, deleteVehicle};
