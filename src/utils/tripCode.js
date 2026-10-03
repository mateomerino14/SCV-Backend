// Genera el codigo unico de un viaje a partir del año de inicio
const buildTripCode = (trip) => {
  const tripId = trip.id_viaje || trip.id;
  const referenceDate = trip.fecha_inicio ? new Date(`${trip.fecha_inicio}T00:00:00`) : new Date();
  const year = referenceDate.getFullYear();
  return `VIA-${tripId}/${year}`;
};

module.exports = {buildTripCode};
