const supabase = require('../../src/config/supabase');
const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(60000);

let employee;

// Crea un viaje con un gasto del dia y devuelve su id
const createTripWithExpense = async () => {
  const created = await employee.post('/trip', {
    motivo: 'Viaje para numero de rendicion', origen: 'La Paz', destino: 'Tarija', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
    tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 900,
  });
  const tripId = created.body.id_viaje;
  await supabase.from('Viaje').update({estado: 'EN_CURSO', fue_iniciado: true}).eq('id_viaje', tripId);
  await employee.postForm('/expense/register', {id_viaje: tripId, monto_total: 30, fecha_gasto: boliviaDate(), tipo: 'C', descripcion: 'Compra', id_categoria_gasto: 1, es_gasto_internacional: false});
  return tripId;
};

// Lee el numero y el mes de rendicion de un viaje
const readNumber = async (tripId) => (await supabase.from('Viaje').select('numero_rendicion, periodo_rendicion').eq('id_viaje', tripId).single()).data;

beforeAll(async () => {
  employee = api(await login('juan.empleado'));
});

// Cada rendicion aprobada del todo recibe el siguiente numero del mes de sus comprobantes y lo conserva
test('asigna el número de rendición del mes al aprobar del todo', async () => {
  const firstTrip = await createTripWithExpense();
  const secondTrip = await createTripWithExpense();
  await supabase.from('Viaje').update({estado: 'APROBADO_SUPERVISOR'}).eq('id_viaje', firstTrip);
  expect((await readNumber(firstTrip)).numero_rendicion).toBeNull();
  await supabase.from('Viaje').update({estado: 'APROBADO_FINAL'}).eq('id_viaje', firstTrip);
  await supabase.from('Viaje').update({estado: 'APROBADO_FINAL'}).eq('id_viaje', secondTrip);
  const first = await readNumber(firstTrip);
  const second = await readNumber(secondTrip);
  expect(first.periodo_rendicion).toBe(boliviaDate().slice(0, 7));
  expect(second.numero_rendicion).toBe(first.numero_rendicion + 1);
  await supabase.from('Viaje').update({estado: 'APROBADO_FINAL'}).eq('id_viaje', firstTrip);
  expect((await readNumber(firstTrip)).numero_rendicion).toBe(first.numero_rendicion);
});
