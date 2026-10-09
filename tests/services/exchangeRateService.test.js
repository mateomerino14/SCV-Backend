const storedRates = [];
const upserts = [];
const supabaseMock = {
  from: () => {
    const filters = {};
    const query = {
      select: () => query,
      eq: (column, value) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => ({data: storedRates.find((row) => row.fecha === filters.fecha && row.moneda === filters.moneda) || null}),
      upsert: async (rows) => {
        upserts.push(...rows);
        return {error: null};
      },
    };
    return query;
  },
};
jest.mock('../../src/config/supabase', () => supabaseMock);
const exchangeRateService = require('../../src/services/shared/exchangeRateService');

const apiResponse = (rates) => ({ok: true, json: async () => ({usd: rates})});

beforeEach(() => {
  storedRates.length = 0;
  upserts.length = 0;
  global.fetch = jest.fn();
  delete process.env.EXCHANGE_RATE_API_URLS;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
});

// Usa el tipo de cambio guardado sin volver a consultar la API
test('usa el tipo de cambio guardado de esa fecha', async () => {
  storedRates.push({fecha: '2026-10-05', moneda: 'PEN', tasa: '3.45', fuente: 'currency-api'});
  const result = await exchangeRateService.getDailyRate('2026-10-05', 'pen');
  expect(result.rate.tasa).toBe(3.45);
  expect(global.fetch).not.toHaveBeenCalled();
});

// Consulta la API cuando no esta guardado y guarda todas las monedas del dia
test('consulta la API y guarda las tasas del dia', async () => {
  global.fetch.mockResolvedValue(apiResponse({pen: 3.45, eur: 0.88, clp: 970}));
  const result = await exchangeRateService.getDailyRate('2026-10-05', 'EUR');
  expect(result.rate).toEqual({fecha: '2026-10-05', moneda: 'EUR', tasa: 0.88, fuente: 'currency-api'});
  expect(upserts.map((row) => row.moneda).sort()).toEqual(['CLP', 'EUR', 'PEN']);
});

// Si la primera direccion falla, prueba con la de respaldo
test('usa la direccion de respaldo si la primera falla', async () => {
  global.fetch.mockRejectedValueOnce(new Error('caida')).mockResolvedValueOnce(apiResponse({pen: 3.5}));
  const result = await exchangeRateService.getDailyRate('2026-10-06', 'PEN');
  expect(result.rate.tasa).toBe(3.5);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

// Sin respuesta de la API permite ingresar el tipo de cambio a mano
test('sin API responde que se puede ingresar a mano', async () => {
  global.fetch.mockRejectedValue(new Error('sin red'));
  const result = await exchangeRateService.getDailyRate('2026-10-07', 'PEN');
  expect(result.status).toBe(503);
  expect(result.permiteManual).toBe(true);
});

// Rechaza monedas que no estan en la lista
test('rechaza una moneda no disponible', async () => {
  const result = await exchangeRateService.getDailyRate('2026-10-07', 'XYZ');
  expect(result.status).toBe(400);
});

// Calcula los tramos con la tasa del dia y marca los ingresados a mano
test('resuelve los tramos con la tasa del dia o la manual', async () => {
  storedRates.push({fecha: '2026-10-05', moneda: 'PEN', tasa: '3.75', fuente: 'currency-api'});
  global.fetch.mockRejectedValue(new Error('sin red'));
  const result = await exchangeRateService.resolveSegmentRates('2026-10-05', [
    {moneda: 'PEN', monto_origen: 150, tipo_cambio: 99},
    {moneda: 'CLP', monto_origen: 9500, tipo_cambio: 950},
  ]);
  expect(result.segments).toEqual([
    {moneda: 'PEN', monto_origen: 150, tipo_cambio: 3.75, tipo_cambio_manual: false, monto_usd: 40},
    {moneda: 'CLP', monto_origen: 9500, tipo_cambio: 950, tipo_cambio_manual: true, monto_usd: 10},
  ]);
});

// Sin API y sin tipo de cambio manual no deja guardar el tramo
test('exige el tipo de cambio manual si la API no responde', async () => {
  global.fetch.mockRejectedValue(new Error('sin red'));
  const result = await exchangeRateService.resolveSegmentRates('2026-10-08', [{moneda: 'CLP', monto_origen: 9500}]);
  expect(result.status).toBe(400);
  expect(result.permiteManual).toBe(true);
});
