const {login, api, boliviaDate} = require('./helpers');
const {startExchangeRateMock} = require('../support/exchangeRateMock');

let mock;
let employee;

beforeAll(async () => {
  mock = await startExchangeRateMock();
  process.env.EXCHANGE_RATE_API_URLS = mock.url;
  employee = api(await login('juan.empleado'));
});

afterAll(() => {
  mock.server.close();
});

// Devuelve el tipo de cambio del dia desde la API y despues desde la base
test('obtiene el tipo de cambio del dia y lo guarda', async () => {
  const date = boliviaDate(-30);
  const first = await employee.get(`/exchange-rate?fecha=${date}&moneda=PEN`);
  expect(first.status).toBe(200);
  expect(first.body.tasa).toBe(3.75);
  mock.state.failing = true;
  const second = await employee.get(`/exchange-rate?fecha=${date}&moneda=EUR`);
  mock.state.failing = false;
  expect(second.status).toBe(200);
  expect(second.body.tasa).toBe(0.88);
});

// Si la API no responde indica que se puede escribir a mano
test('avisa que se puede ingresar a mano si la API falla', async () => {
  mock.state.failing = true;
  const response = await employee.get(`/exchange-rate?fecha=${boliviaDate(-60)}&moneda=CLP`);
  mock.state.failing = false;
  expect(response.status).toBe(503);
  expect(response.body.permiteManual).toBe(true);
});

// Solo se aceptan las monedas de la lista
test('lista las monedas disponibles y rechaza otras', async () => {
  const currencies = await employee.get('/exchange-rate/currencies');
  expect(currencies.body.monedas).toEqual(['EUR', 'PEN', 'ARS', 'BRL', 'CLP', 'COP', 'MXN']);
  const response = await employee.get(`/exchange-rate?fecha=${boliviaDate()}&moneda=XYZ`);
  expect(response.status).toBe(400);
});
