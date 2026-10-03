const supabase = require('../../config/supabase');
const textNormalizer = require('../../utils/textNormalizer');
const userDirectoryService = require('../user/userDirectoryService');
const substitutionService = require('../approval/substitutionService');
const hierarchyAssignmentService = require('../shared/hierarchyAssignmentService');

// Roles unicos o de control que revisan viajes de toda la empresa
const companyWideRoles = ['ADMINISTRADOR', 'REVISOR', 'APROBADOR'];

// Obtiene el rol y el cargo de quien hace la consulta
const getRequester = async (userId) => {
  const {data} = await supabase
    .from('Usuario')
    .select('id_usuario, Rol(nombre), Cargo(nombre)')
    .eq('id_usuario', userId)
    .single();
  return data;
};

// Indica si el usuario tiene el cargo de tesorero
const isTreasurer = (user) =>
  textNormalizer.normalizeText(user?.Cargo?.nombre || '') === textNormalizer.normalizeText(userDirectoryService.treasurerPositionName);

// El usuario ya aprobo o rechazo este viaje en alguna etapa (queda en su historial)
const hasReviewedTrip = async (tripId, userId) => {
  const {data} = await supabase
    .from('Revision_Viaje')
    .select('id_revision')
    .eq('id_viaje', tripId)
    .eq('id_usuario', userId)
    .limit(1);
  return (data || []).length > 0;
};

// Indica si el dueño del viaje esta dentro del alcance del supervisor
const isInSupervisorScope = async (trip, supervisorId) => {
  const eligible = await hierarchyAssignmentService.filterTripsByHierarchy([trip], supervisorId, 'SUPERVISOR', (item) => item.id_usuario);
  return eligible.length > 0;
};

// Indica si un supervisor puede acceder al viaje (asignado, revisado o en su alcance)
const canSupervisorAccessTrip = async (trip, supervisorId) => {
  if (trip.id_supervisor_asignado === supervisorId) {
    return true;
  }
  if (await hasReviewedTrip(trip.id_viaje, supervisorId)) {
    return true;
  }
  if (!trip.id_supervisor_asignado) {
    return isInSupervisorScope(trip, supervisorId);
  }
  return false;
};

// Indica quien puede ver el detalle de un viaje segun su participacion
const canViewTrip = async (tripId, userId) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('id_viaje, id_usuario, id_supervisor_asignado')
    .eq('id_viaje', tripId)
    .single();
  if (!trip) {
    return false;
  }
  if (trip.id_usuario === userId) {
    return true;
  }
  const requester = await getRequester(userId);
  const roleName = requester?.Rol?.nombre;
  if (companyWideRoles.includes(roleName) || isTreasurer(requester)) {
    return true;
  }
  if (await substitutionService.canActOnTrip(tripId, userId)) {
    return true;
  }
  if (roleName === 'SUPERVISOR') {
    return canSupervisorAccessTrip(trip, userId);
  }
  return false;
};

// Puede emitir o reenviar recibos del viaje: el dueño, su reemplazo aprobado o el tesorero
const canManageTripReceipts = async (tripId, userId) => {
  if (await substitutionService.canActOnTrip(tripId, userId)) {
    return true;
  }
  return isTreasurer(await getRequester(userId));
};

module.exports = {canViewTrip, canManageTripReceipts, canSupervisorAccessTrip, isInSupervisorScope};
