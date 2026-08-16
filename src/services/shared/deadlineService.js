const supabase = require('../../config/supabase')
const toleranceDays = 4

// Formatea una fecha ISO a formato dia/mes/anio
const formatDate = (isoString) => {
  const [year, month, day] = isoString.split('-')
  return `${day}/${month}/${year}`
};

// Suma una cantidad de dias a una fecha ISO
const addDays = (isoDate, days) => {
  const date = new Date(isoDate)
  date.setDate(date.getDate() + days)
  return date
};

// Valida si una fecha de evento esta dentro del plazo permitido del viaje
async function validateTripDeadline(tripId, eventDate) {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('fecha_inicio, fecha_fin')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {valid: false, error: 'Viaje no encontrado'}
  }
  const today = new Date().toISOString().split('T')[0]
  const toleranceEndDate = addDays(trip.fecha_fin, toleranceDays)
  const toleranceEndDateStr = toleranceEndDate.toISOString().split('T')[0]
  if (today > toleranceEndDateStr) {
    const {data: approvedRequest} = await supabase
      .from('Solicitud_Autorizacion_Plazo')
      .select('id_solicitud, fecha_respuesta')
      .eq('id_viaje', tripId)
      .eq('estado', 'APROBADA')
      .order('fecha_respuesta', {ascending: false})
      .limit(1)
      .maybeSingle()
    let withinExtension = false
    if (approvedRequest?.fecha_respuesta) {
      const extendedLimit = addDays(approvedRequest.fecha_respuesta.split('T')[0], toleranceDays)
      const extendedLimitStr = extendedLimit.toISOString().split('T')[0]
      withinExtension = today <= extendedLimitStr
    }
    if (!withinExtension) {
      return {
        valid: false,
        requiereAutorizacion: true,
        error: `Han pasado más de ${toleranceDays} días desde el fin del viaje (${formatDate(trip.fecha_fin)}). Debes solicitar autorización al revisor para continuar registrando gastos.`,
      }
    }
  }
  if (eventDate < trip.fecha_inicio || eventDate > trip.fecha_fin) {
    return {
      valid: false,
      error: `La fecha debe estar dentro del período del viaje (${formatDate(trip.fecha_inicio)} - ${formatDate(trip.fecha_fin)})`,
    }
  }
  return {valid: true}
}

module.exports = {validateTripDeadline, toleranceDays};