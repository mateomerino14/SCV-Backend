jest.mock('../../src/config/supabase', () => ({}));
const tripService = require('../../src/services/trip/tripService');
const tripExportService = require('../../src/services/trip/tripExportService');

const position = {monto_diario: '300', monto_diario_usd: '40'};

// Cuenta el dia de inicio y el de fin
test('cuenta los dias del viaje incluyendo inicio y fin', () => {
  expect(tripService.calculateTripDays('2026-10-20', '2026-10-23')).toBe(4);
  expect(tripService.calculateTripDays('2026-12-31', '2027-01-01')).toBe(2);
});

// En un viaje nacional el tope es dias por tarifa mas hospedaje y no hay tope en USD
test('calcula el tope de un viaje nacional', () => {
  const limits = tripService.buildRequestLimits({tipo: 'Nacional', fecha_inicio: '2026-10-20', fecha_fin: '2026-10-22', hospedaje_estimado: 300, hospedaje_estimado_usd: 50}, position);
  expect(limits).toMatchObject({days: 3, limit: 1200, limitUsd: 0, lodgingUsd: 0});
});

// En un viaje internacional hay un tope por cada moneda
test('calcula el tope de un viaje internacional en las dos monedas', () => {
  const limits = tripService.buildRequestLimits({tipo: 'Internacional', fecha_inicio: '2026-10-20', fecha_fin: '2026-10-23', hospedaje_estimado: 0, hospedaje_estimado_usd: 100}, position);
  expect(limits).toMatchObject({days: 4, limit: 1200, limitUsd: 260});
});

// Limpia la lista de ids recibida para exportar
test('interpreta la lista de viajes a exportar', () => {
  expect(tripExportService.parseTripIds('3,1, 3,abc,-2,7')).toEqual([3, 1, 7]);
  expect(tripExportService.parseTripIds('')).toEqual([]);
});
