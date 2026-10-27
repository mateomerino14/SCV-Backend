jest.mock('../../src/config/supabase', () => ({}));
const tripExportService = require('../../src/services/trip/tripExportService');

// Limpia la lista de ids recibida para exportar
test('interpreta la lista de viajes a exportar', () => {
  expect(tripExportService.parseTripIds('3,1, 3,abc,-2,7')).toEqual([3, 1, 7]);
  expect(tripExportService.parseTripIds('')).toEqual([]);
});
