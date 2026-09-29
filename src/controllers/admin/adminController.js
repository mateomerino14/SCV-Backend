const supabase = require('../../config/supabase')

// Supabase devuelve como maximo 1000 filas por consulta: se lee por paginas para que
// los totales no se queden cortos cuando haya muchos viajes o usuarios
const pageSize = 1000
const fetchAllRows = async (table, columns, idColumn) => {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const {data, error} = await supabase.from(table).select(columns).order(idColumn).range(from, from + pageSize - 1)
    if (error || !data) {
      break
    }
    rows.push(...data)
    if (data.length < pageSize) {
      break
    }
  }
  return rows
}

// Obtiene las estadisticas generales del dashboard de administrador
const getDashboardStats = async (req, res) => {
  const users = await fetchAllRows('Usuario', 'id_usuario, activo, id_rol, id_seccion, Seccion(nombre), Rol(nombre)', 'id_usuario')
  const trips = await fetchAllRows('Viaje', 'id_viaje, estado, monto_asignado, monto_asignado_usd, Usuario!viaje_id_usuario_foreign(id_seccion, Seccion(nombre))', 'id_viaje')
  const positions = await fetchAllRows('Cargo', 'id_cargo, activo', 'id_cargo')
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
  const tripsPendingAlcoholReview = trips?.filter((trip) => trip.estado === 'EN_REVISION_APROBADOR').length || 0
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
    const sectionName = trip.Usuario?.Seccion?.nombre || 'Sin sección'
    if (!sectionStats[sectionName]) {
      sectionStats[sectionName] = {cantidadViajes: 0, montoAsignado: 0, montoAsignadoUsd: 0}
    }
    sectionStats[sectionName].cantidadViajes += 1
    sectionStats[sectionName].montoAsignado += parseFloat(trip.monto_asignado || 0)
    sectionStats[sectionName].montoAsignadoUsd += parseFloat(trip.monto_asignado_usd || 0)
  }
  const viajesPorSeccion = Object.entries(sectionStats).map(([seccion, stats]) => ({
    seccion,
    cantidadViajes: stats.cantidadViajes,
    montoAsignado: parseFloat(stats.montoAsignado.toFixed(2)),
    montoAsignadoUsd: parseFloat(stats.montoAsignadoUsd.toFixed(2)),
  }))
  const usersBySectionCount = {}
  for (const user of users || []) {
    const sectionName = user.Seccion?.nombre || 'Sin sección'
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
    viajesEnRevisionAprobador: tripsPendingAlcoholReview,
    viajesAprobados: tripsFinalApproved,
    viajesRechazados: tripsRejected,
    usuariosPorRol: usersByRole,
    viajesPorSeccion,
    usuariosPorSeccion,
  })
};

module.exports = {getDashboardStats};