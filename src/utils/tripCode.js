// Genera el codigo unico y estandarizado de un viaje, usado en memorandums,
// notificaciones, la planilla y el excel. Se basa en el año de inicio del
// viaje (no en la fecha en que se genera el documento), para que el codigo
// sea siempre el mismo sin importar cuando se consulte.
const buildTripCode = (trip) => {
  const tripId = trip.id_viaje || trip.id
  const referenceDate = trip.fecha_inicio ? new Date(`${trip.fecha_inicio}T00:00:00`) : new Date()
  const year = referenceDate.getFullYear()
  return `VIA-${tripId}/${year}`
}

module.exports = {buildTripCode}
