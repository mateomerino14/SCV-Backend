const supabase = require('../../config/supabase')
const hierarchyAssignmentService = require('../shared/hierarchyAssignmentService')
const userDirectoryService = require('../user/userDirectoryService')

// El tesorero no es un rol sino un cargo (unico); devuelve su id o null
const getTreasurerId = async () => {
  const users = await userDirectoryService.getActiveUsersWithActivePosition()
  const treasurers = userDirectoryService.getUsersByPositionName(users, userDirectoryService.treasurerPositionName)
  return treasurers[0]?.id_usuario || null
}

// Etapas atendidas por una sola persona (rol o cargo unico). Si el viaje llega a la
// etapa de su propio dueño, esa etapa se aprueba automaticamente: nadie revisa lo suyo
// y no hay otra persona que pueda hacerlo.
const stages = {
  APROBADO_VIAJE: {label: 'aprobador', getHolder: () => hierarchyAssignmentService.getUniqueRoleHolder('APROBADOR'), approve: (tripId, userId) => require('./approverService').approveTrip(tripId, userId, {selfStageSkip: true})},
  EN_REVISION_TESORERO: {label: 'tesorero', getHolder: getTreasurerId, approve: (tripId, userId) => require('./treasurerService').approveTrip(tripId, userId, {selfStageSkip: true})},
  EN_REVISION_APROBADOR: {label: 'aprobador', getHolder: () => hierarchyAssignmentService.getUniqueRoleHolder('APROBADOR'), approve: (tripId, userId) => require('./approverAlcoholReviewService').approveAlcoholReview(tripId, userId, {selfStageSkip: true})},
  APROBADO_SUPERVISOR: {label: 'revisor', getHolder: () => hierarchyAssignmentService.getUniqueRoleHolder('REVISOR'), approve: (tripId, userId) => require('./reviewerService').approveReview(tripId, userId, {selfStageSkip: true})},
}

// Avanza el viaje mientras este en una etapa cuyo responsable unico es su propio dueño.
// Puede encadenar etapas (p. ej. revision por alcohol y luego revision final).
const advanceSelfReviewStages = async (tripId) => {
  for (let step = 0; step < Object.keys(stages).length; step++) {
    const {data: trip} = await supabase.from('Viaje').select('id_usuario, estado').eq('id_viaje', tripId).single()
    const stage = stages[trip?.estado]
    if (!stage) {
      return
    }
    const holderId = await stage.getHolder()
    if (!holderId || holderId !== trip.id_usuario) {
      return
    }
    console.info(`[Etapa propia] Viaje ${tripId}: ${trip.estado} aprobado automaticamente (el ${stage.label} es el dueño del viaje).`)
    const result = await stage.approve(tripId, holderId)
    if (result?.error) {
      console.warn(`[Etapa propia] No se pudo avanzar el viaje ${tripId}:`, result.error)
      return
    }
  }
}

module.exports = {advanceSelfReviewStages}
