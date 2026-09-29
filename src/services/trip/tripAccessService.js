const supabase = require('../../config/supabase')
const textNormalizer = require('../../utils/textNormalizer')
const userDirectoryService = require('../user/userDirectoryService')
const substitutionService = require('../approval/substitutionService')

// Roles que revisan viajes de otras personas y pueden consultar su detalle
const reviewerRoles = ['ADMINISTRADOR', 'SUPERVISOR', 'REVISOR', 'APROBADOR']

const getRequester = async (userId) => {
  const {data} = await supabase
    .from('Usuario')
    .select('id_usuario, Rol(nombre), Cargo(nombre)')
    .eq('id_usuario', userId)
    .single()
  return data
}

const isTreasurer = (user) =>
  textNormalizer.normalizeText(user?.Cargo?.nombre || '') === textNormalizer.normalizeText(userDirectoryService.treasurerPositionName)

// Puede ver el detalle de un viaje (sus gastos, comprobantes y documentos): el dueño, su
// reemplazo aprobado, el tesorero y los roles que revisan. Un empleado no puede ver
// viajes ajenos cambiando el id en la direccion.
const canViewTrip = async (tripId, userId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario').eq('id_viaje', tripId).single()
  if (!trip) {
    return false
  }
  if (trip.id_usuario === userId) {
    return true
  }
  const requester = await getRequester(userId)
  if (reviewerRoles.includes(requester?.Rol?.nombre) || isTreasurer(requester)) {
    return true
  }
  return substitutionService.canActOnTrip(tripId, userId)
}

// Puede emitir o reenviar recibos del viaje: el dueño, su reemplazo aprobado o el tesorero
const canManageTripReceipts = async (tripId, userId) => {
  if (await substitutionService.canActOnTrip(tripId, userId)) {
    return true
  }
  return isTreasurer(await getRequester(userId))
}

module.exports = {canViewTrip, canManageTripReceipts}
