const supabase = require('../../config/supabase')
const textNormalizer = require('../../utils/textNormalizer')

const approverRoleId = 5
const reviewerRoleId = 4

const uniqueRoles = [
  {id: approverRoleId, nombre: 'Aprobador'},
  {id: reviewerRoleId, nombre: 'Revisor'},
]

const uniquePositions = [
  'Asistente Administrativo de Seguros y Servicios',
  'Asistente Administrativo - Cargo y Descargo de Cta. Documentada',
  'Asistente de Caja y Tesorería',
  'Gerente RRHH',
  'Jefe de Recursos Humanos',
]

const uniquePositionsNormalized = uniquePositions.map((position) => textNormalizer.normalizeText(position))

// Verifica que no exista otro usuario activo con el mismo rol unico
const validateUniqueRole = async (roleId, excludeUserId) => {
  const roleInfo = uniqueRoles.find((role) => role.id === parseInt(roleId))
  if (!roleInfo) {
    return null
  }
  let query = supabase.from('Usuario').select('id_usuario').eq('id_rol', roleInfo.id).eq('activo', true)
  if (excludeUserId) {
    query = query.neq('id_usuario', excludeUserId)
  }
  const {data} = await query
  if (data && data.length > 0) {
    return `Ya existe un usuario activo con el rol de ${roleInfo.nombre}. Solo puede haber uno en el sistema.`
  }
  else {
    return null
  }
};

// Verifica que no exista otro usuario activo con el mismo cargo unico
const validateUniquePosition = async (positionId, excludeUserId) => {
  if (!positionId) {
    return null
  }
  const {data: position} = await supabase.from('Cargo').select('nombre').eq('id_cargo', positionId).single()
  if (!position) {
    return null
  }
  const normalizedPosition = textNormalizer.normalizeText(position.nombre)
  if (!uniquePositionsNormalized.includes(normalizedPosition)) {
    return null
  }
  let query = supabase.from('Usuario').select('id_usuario, Cargo(nombre)').eq('activo', true)
  if (excludeUserId) {
    query = query.neq('id_usuario', excludeUserId)
  }
  const {data} = await query
  const alreadyExists = (data || []).some((user) => textNormalizer.normalizeText(user.Cargo?.nombre || '') === normalizedPosition)
  if (alreadyExists) {
    return `Ya existe un usuario activo con el cargo de "${position.nombre}". Solo puede haber uno en el sistema.`
  }
  else {
    return null
  }
};

// Libera los viajes asignados a un usuario en cada rol de revision
const releaseAssignedTrips = async (userId) => {
  await supabase.from('Viaje')
    .update({id_supervisor_asignado: null})
    .eq('id_supervisor_asignado', userId)
    .in('estado', ['EN_REVISION_VIAJE', 'EN_REVISION'])
  await supabase.from('Viaje')
    .update({id_aprobador_asignado: null})
    .eq('id_aprobador_asignado', userId)
    .eq('estado', 'APROBADO_VIAJE')
  await supabase.from('Viaje')
    .update({id_revisor_asignado: null})
    .eq('id_revisor_asignado', userId)
    .eq('estado', 'APROBADO_SUPERVISOR')
  await supabase.from('Viaje')
    .update({id_tesorero_asignado: null})
    .eq('id_tesorero_asignado', userId)
    .eq('estado', 'EN_REVISION_TESORERO')
};

module.exports = {validateUniqueRole, validateUniquePosition, releaseAssignedTrips};