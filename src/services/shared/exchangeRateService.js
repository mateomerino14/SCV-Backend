const supabase = require('../../config/supabase');

const supportedCurrencies = ['EUR', 'PEN', 'ARS', 'BRL', 'CLP', 'COP', 'MXN'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const requestTimeoutMs = 6000;
const sourceName = 'currency-api';
const defaultApiUrls = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{fecha}/v1/currencies/usd.json',
  'https://{fecha}.currency-api.pages.dev/v1/currencies/usd.json',
];

// Direcciones de la API; EXCHANGE_RATE_API_URLS permite cambiarlas (separadas por coma)
const getApiUrls = () => {
  if (process.env.EXCHANGE_RATE_API_URLS) {
    return process.env.EXCHANGE_RATE_API_URLS.split(',').map((url) => url.trim()).filter(Boolean);
  }
  return defaultApiUrls;
};

// Indica si la moneda esta entre las que se pueden registrar en un tramo
const isSupportedCurrency = (currency) => supportedCurrencies.includes(String(currency || '').trim().toUpperCase());

// Consulta la API con un tiempo maximo de espera; devuelve las tasas por 1 USD o null
const fetchRatesFromApi = async (date) => {
  for (const template of getApiUrls()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(template.replace('{fecha}', date), {signal: controller.signal});
      if (response.ok) {
        const body = await response.json();
        if (body?.usd) {
          return body.usd;
        }
      }
    }
    catch (error) {
      console.warn('Tipo de cambio no disponible en', template, error.message);
    }
    finally {
      clearTimeout(timer);
    }
  }
  return null;
};

// Guarda las tasas del dia de todas las monedas soportadas, para no volver a consultar la API
const saveDailyRates = async (date, rates) => {
  const rows = supportedCurrencies
    .filter((currency) => parseFloat(rates[currency.toLowerCase()]) > 0)
    .map((currency) => ({fecha: date, moneda: currency, tasa: parseFloat(rates[currency.toLowerCase()]), fuente: sourceName}));
  if (rows.length > 0) {
    const {error} = await supabase.from('Tipo_Cambio_Diario').upsert(rows, {onConflict: 'fecha,moneda', ignoreDuplicates: true});
    if (error) {
      console.warn('No se pudo guardar el tipo de cambio diario:', error.message);
    }
  }
};

// Obtiene el tipo de cambio de una moneda en una fecha: primero de la base y, si no esta, de la API
const getDailyRate = async (date, currency) => {
  const code = String(currency || '').trim().toUpperCase();
  if (!datePattern.test(String(date || ''))) {
    return {error: 'La fecha del tipo de cambio debe tener el formato AAAA-MM-DD', status: 400};
  }
  if (!isSupportedCurrency(code)) {
    return {error: `La moneda ${code || 'indicada'} no está disponible`, status: 400};
  }
  const {data: stored} = await supabase
    .from('Tipo_Cambio_Diario')
    .select('fecha, moneda, tasa, fuente')
    .eq('fecha', date)
    .eq('moneda', code)
    .maybeSingle();
  if (stored) {
    return {rate: {fecha: stored.fecha, moneda: stored.moneda, tasa: parseFloat(stored.tasa), fuente: stored.fuente}};
  }
  const rates = await fetchRatesFromApi(date);
  const rate = parseFloat(rates?.[code.toLowerCase()]);
  if (!(rate > 0)) {
    return {error: 'No se pudo obtener el tipo de cambio del día. Puedes ingresarlo manualmente.', status: 503, permiteManual: true};
  }
  await saveDailyRates(date, rates);
  return {rate: {fecha: date, moneda: code, tasa: rate, fuente: sourceName}};
};

// Asigna a cada tramo el tipo de cambio del dia; si la API no responde, usa el escrito a mano
const resolveSegmentRates = async (date, segments) => {
  const resolved = [];
  for (const segment of segments) {
    const currency = String(segment.moneda || '').trim().toUpperCase();
    const result = await getDailyRate(date, currency);
    if (result.rate) {
      resolved.push({moneda: currency, monto_origen: parseFloat(segment.monto_origen), tipo_cambio: result.rate.tasa, tipo_cambio_manual: false});
      continue;
    }
    if (!result.permiteManual) {
      return {error: result.error, status: result.status};
    }
    if (!(parseFloat(segment.tipo_cambio) > 0)) {
      return {error: `No se pudo obtener el tipo de cambio del día para ${currency}. Ingrésalo manualmente.`, status: 400, permiteManual: true};
    }
    resolved.push({moneda: currency, monto_origen: parseFloat(segment.monto_origen), tipo_cambio: parseFloat(segment.tipo_cambio), tipo_cambio_manual: true});
  }
  return {
    segments: resolved.map((segment) => ({...segment, monto_usd: parseFloat((segment.monto_origen / segment.tipo_cambio).toFixed(2))})),
  };
};

module.exports = {supportedCurrencies, isSupportedCurrency, getDailyRate, resolveSegmentRates};
