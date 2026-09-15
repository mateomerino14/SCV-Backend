const supabase = require('../../config/supabase')

// Obtiene las estadisticas generales del dashboard de administrador
const getDashboardStats = async (req, res) => {
  const {data: users} = await supabase.from('Usuario').select('id_usuario, activo, id_rol, numero_seccion, Rol(nombre)')
  const {data: trips} = await supabase.from('Viaje').select('id_viaje, estado, monto_asignado, Usuario!viaje_id_usuario_foreign(numero_seccion)')
  const {data: positions} = await supabase.from('Cargo').select('id_cargo, activo')
  const totalUsers = users?.length || 0
  const activeUsers = users?.filter((user) => user.activo).length || 0
  const totalPositions = positions?.length || 0
  const activePositions = positions?.filter((position) => position.activo).length || 0
  const tripsPendingTripReview = trips?.filter((trip) => trip.estado === 'EN_REVISION_VIAJE').length || 0
  const tripsApprovedByApprover = trips?.filter((trip) => trip.estado === 'APROBADO_VIAJE').length || 0
  const tripsPendingTreasurerReview = trips?.filter((trip) => trip.estado === 'EN_REVISION_TESORERO').length || 0
  const tripsInProgress = trips?.filter((trip) => trip.estado === 'EN_CURSO').length || 0
  const tripsPendingExpenseReview = trips?.filter((trip) => trip.estado === 'EN_REVISION').length || 0
  const tripsApprovedBySupervisor = trips?.filter((trip) => trip.estado === 'APROBADO_SUPERVISOR').length || 0
  const tripsApprovedByApproverFinal = trips?.filter((trip) => trip.estado === 'APROBADO_APROBADOR').length || 0
  const tripsFinalApproved = trips?.filter((trip) => trip.estado === 'APROBADO_FINAL').length || 0
  const tripsRejected = trips?.filter((trip) => trip.estado === 'RECHAZADO').length || 0
  const roleCount = {}
  for (const user of users || []) {
    const roleName = user.Rol?.nombre || 'Sin rol'
    roleCount[roleName] = (roleCount[roleName] || 0) + 1
  }
  const usersByRole = Object.entries(roleCount).map(([nombre, cantidad]) => ({nombre, cantidad}))
  const sectionStats = {}
  for (const trip of trips || []) {
    const sectionName = trip.Usuario?.numero_seccion || 'Sin sección'
    if (!sectionStats[sectionName]) {
      sectionStats[sectionName] = {cantidadViajes: 0, montoAsignado: 0}
    }
    sectionStats[sectionName].cantidadViajes += 1
    sectionStats[sectionName].montoAsignado += parseFloat(trip.monto_asignado || 0)
  }
  const viajesPorSeccion = Object.entries(sectionStats).map(([seccion, stats]) => ({
    seccion, cantidadViajes: stats.cantidadViajes, montoAsignado: stats.montoAsignado,
  }))
  const usersBySectionCount = {}
  for (const user of users || []) {
    const sectionName = user.numero_seccion || 'Sin sección'
    usersBySectionCount[sectionName] = (usersBySectionCount[sectionName] || 0) + 1
  }
  const usuariosPorSeccion = Object.entries(usersBySectionCount).map(([seccion, cantidad]) => ({seccion, cantidad}))
  return res.json({
    totalUsuarios: totalUsers,
    usuariosActivos: activeUsers,
    totalCargos: totalPositions,
    cargosActivos: activePositions,
    viajesEnRevisionViaje: tripsPendingTripReview,
    viajesAprViaje: tripsApprovedByApprover,
    viajesEnRevisionTesorero: tripsPendingTreasurerReview,
    viajesEnCurso: tripsInProgress,
    viajesEnRevision: tripsPendingExpenseReview,
    viajesAprSupervisor: tripsApprovedBySupervisor,
    viajesAprAprobador: tripsApprovedByApproverFinal,
    viajesAprobados: tripsFinalApproved,
    viajesRechazados: tripsRejected,
    usuariosPorRol: usersByRole,
    viajesPorSeccion,
    usuariosPorSeccion,
  })
};

module.exports = {getDashboardStats};