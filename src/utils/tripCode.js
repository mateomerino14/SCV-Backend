// Genera el codigo del viaje VIA-numero/año con el numero anual que le dio la base de datos
const buildTripCode = (trip) => {
  if (trip.numero_viaje && trip.anio_viaje) {
    return `VIA-${trip.numero_viaje}/${trip.anio_viaje}`;
  }
  const tripId = trip.id_viaje || trip.id;
  const referenceDate = trip.fecha_inicio ? new Date(`${trip.fecha_inicio}T00:00:00`) : new Date();
  return `VIA-${tripId}/${referenceDate.getFullYear()}`;
};

module.exports = {buildTripCode};
