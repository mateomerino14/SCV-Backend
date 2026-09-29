const supabase = require('../../config/supabase')
const hierarchyAssignmentService = require('../shared/hierarchyAssignmentService')

// Etapas del flujo en las que alguien aprueba o rechaza un viaje
const reviewStages = {
  tripReview: 'REVISION_VIAJE',
  tripApproval: 'APROBACION_VIAJE',
  fundAssignment: 'ASIGNACION_FONDOS',
  expenseReview: 'REVISION_GASTOS',
  alcoholReview: 'REVISION_ALCOHOL',
  finalReview: 'REVISION_FINAL',
}

// Deja constancia de quien aprobo o rechazo el viaje en una etapa. Las aprobaciones
// automaticas (el revisor es el propio viajero) se guardan marcadas y no cuentan en
// su historial. Un fallo aqui no debe deshacer la aprobacion, solo se registra en el log.
const recordReview = async (tripId, userId, stage, action, {automatic = false} = {}) => {
  const {error} = await supabase.from('Revision_Viaje').insert({
    id_viaje: parseInt(tripId),
    id_usuario: userId,
    etapa: stage,
    accion: action,
    automatica: automatic,
    fecha: new Date().toISOString(),
  })
  if (error) {
    console.warn(`[Revision] No se pudo registrar ${action} del viaje ${tripId} en ${stage}:`, error.message)
  }
}

const applyTripFilters = (query, filters) => {
  let filtered = query
  if (filters.fecha_inicio) {
    filtered = filtered.gte('fecha_inicio', filters.fecha_inicio)
  }
  if (filters.fecha_fin) {
    filtered = filtered.lte('fecha_fin', filters.fecha_fin)
  }
  if (filters.id_empleado) {
    filtered = filtered.eq('id_usuario', filters.id_empleado)
  }
  return filtered
}

// Ultimo registro (de cualquier persona) de cada viaje, para saber si un rechazo sigue vigente
const getLatestEntryByTrip = async (tripIds) => {
  if (tripIds.length === 0) {
    return new Map()
  }
  const {data} = await supabase
    .from('Revision_Viaje')
    .select('id_viaje, id_usuario, accion, etapa, fecha')
    .in('id_viaje', tripIds)
    .eq('automatica', false)
    .order('fecha', {ascending: false})
  const latest = new Map()
  ;(data || []).forEach((entry) => {
    if (!latest.has(entry.id_viaje)) {
      latest.set(entry.id_viaje, entry)
    }
  })
  return latest
}

// Suma a la lista de trabajo del usuario los viajes que el mismo reviso en su etapa y
// marca cada viaje con resultado_revision:
// - APROBADO: su ultima accion en la etapa fue aprobarlo (queda en su historial siempre).
// - RECHAZADO: lo rechazo el y el viaje sigue rechazado; cuando el empleado lo corrige
//   y lo reenvia, deja de mostrarse.
// - null: pendiente o sin revision propia.
// Un viaje aprobado antes que hoy revisa otra persona sigue en su historial (asignado_a_mi = false).
const mergeReviewedTrips = async ({userId, stage, trips, select, filters}) => {
  const {data: entries, error} = await supabase
    .from('Revision_Viaje')
    .select('id_viaje, accion, fecha')
    .eq('id_usuario', userId)
    .eq('etapa', stage)
    .eq('automatica', false)
    .order('fecha', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  const ownLatest = new Map()
  ;(entries || []).forEach((entry) => {
    if (!ownLatest.has(entry.id_viaje)) {
      ownLatest.set(entry.id_viaje, entry)
    }
  })
  const baseIds = new Set(trips.map((trip) => trip.id_viaje))
  const missingIds = [...ownLatest.keys()].filter((tripId) => !baseIds.has(tripId))
  let extraTrips = []
  if (missingIds.length > 0) {
    const query = applyTripFilters(supabase.from('Viaje').select(select).in('id_viaje', missingIds), filters)
    const {data, error: tripsError} = await query
    if (tripsError) {
      return {error: tripsError.message}
    }
    extraTrips = hierarchyAssignmentService.filterBySection(data || [], filters.id_seccion)
  }
  const allTrips = [...trips, ...extraTrips]
  const rejectedCandidates = allTrips
    .filter((trip) => trip.estado === 'RECHAZADO' && ownLatest.get(trip.id_viaje)?.accion === 'RECHAZADO')
    .map((trip) => trip.id_viaje)
  const latestByTrip = await getLatestEntryByTrip(rejectedCandidates)
  const tagged = allTrips.map((trip) => {
    const own = ownLatest.get(trip.id_viaje)
    let result = null
    if (own?.accion === 'APROBADO') {
      result = 'APROBADO'
    }
    else if (own?.accion === 'RECHAZADO' && rejectedCandidates.includes(trip.id_viaje)) {
      const latest = latestByTrip.get(trip.id_viaje)
      // El rechazo vigente debe ser exactamente su ultimo registro en esta etapa (no un rechazo
      // suyo en otra etapa, por ejemplo en gastos, cuando este rechazo previo ya se corrigio)
      if (latest && latest.id_usuario === userId && latest.accion === 'RECHAZADO' && latest.etapa === stage && latest.fecha === own.fecha) {
        result = 'RECHAZADO'
      }
    }
    // asignado_a_mi: el viaje esta en su lista de trabajo (no solo en su historial)
    return {...trip, resultado_revision: result, fecha_revision: own?.fecha || null, asignado_a_mi: baseIds.has(trip.id_viaje)}
  })
  // Los viajes que solo llegaron por el historial y ya no tienen un resultado vigente
  // (rechazos ya corregidos por el empleado) no se muestran
  const visible = tagged.filter((trip) => baseIds.has(trip.id_viaje) || trip.resultado_revision)
  visible.sort((first, second) => String(second.fecha_inicio).localeCompare(String(first.fecha_inicio)))
  return {trips: visible}
}

module.exports = {reviewStages, recordReview, mergeReviewedTrips}
