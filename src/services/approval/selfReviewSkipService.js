const supabase = require('../../config/supabase');
const hierarchyAssignmentService = require('../shared/hierarchyAssignmentService');
const userDirectoryService = require('../user/userDirectoryService');

// El tesorero no es un rol sino un cargo (unico); devuelve su id o null
const getTreasurerId = async () => {
  const users = await userDirectoryService.getActiveUsersWithActivePosition();
  const treasurers = userDirectoryService.getUsersByPositionName(users, userDirectoryService.treasurerPositionName);
  return treasurers[0]?.id_usuario || null;
};

// Etapas de una sola persona: si el viaje es suyo, la etapa se aprueba automaticamente
const stages = {
  APROBADO_VIAJE: {label: 'aprobador', getHolder: () => hierarchyAssignmentService.getUniqueRoleHolder('APROBADOR'), approve: (tripId, userId, approvedAsBoss) => require('./approverService').approveTrip(tripId, userId, {selfStageSkip: true, approvedAsBoss})},
  EN_REVISION_TESORERO: {label: 'tesorero', getHolder: getTreasurerId, approve: (tripId, userId) => require('./treasurerService').approveTrip(tripId, userId, {selfStageSkip: true})},
  EN_REVISION_APROBADOR: {label: 'aprobador', getHolder: () => hierarchyAssignmentService.getUniqueRoleHolder('APROBADOR'), approve: (tripId, userId) => require('./approverAlcoholReviewService').approveAlcoholReview(tripId, userId, {selfStageSkip: true})},
  APROBADO_SUPERVISOR: {label: 'revisor', getHolder: () => hierarchyAssignmentService.getUniqueRoleHolder('REVISOR'), approve: (tripId, userId) => require('./reviewerService').approveReview(tripId, userId, {selfStageSkip: true})},
};

// Etapas del aprobador que ya aprobo quien es tambien el jefe directo del empleado
const bossApprovedStages = ['APROBADO_VIAJE', 'EN_REVISION_APROBADOR'];

// Avanza el viaje mientras su etapa la atienda su propio dueño o quien ya la aprobo como jefe directo
const advanceSelfReviewStages = async (tripId) => {
  for (let step = 0; step < Object.keys(stages).length; step++) {
    const {data: trip} = await supabase.from('Viaje').select('id_usuario, id_supervisor_asignado, estado').eq('id_viaje', tripId).single();
    const stage = stages[trip?.estado];
    if (!stage) {
      return;
    }
    const holderId = await stage.getHolder();
    if (!holderId) {
      return;
    }
    const ownStage = holderId === trip.id_usuario;
    const approvedAsBoss = bossApprovedStages.includes(trip.estado) && holderId === trip.id_supervisor_asignado;
    if (!ownStage && !approvedAsBoss) {
      return;
    }
    let reason = `el ${stage.label} es el dueño del viaje`;
    if (approvedAsBoss) {
      reason = `el ${stage.label} ya lo aprobó como jefe directo`;
    }
    console.info(`[Etapa propia] Viaje ${tripId}: ${trip.estado} aprobado automaticamente (${reason}).`);
    const result = await stage.approve(tripId, holderId, approvedAsBoss && !ownStage);
    if (result?.error) {
      console.warn(`[Etapa propia] No se pudo avanzar el viaje ${tripId}:`, result.error);
      return;
    }
  }
};

module.exports = {advanceSelfReviewStages};
