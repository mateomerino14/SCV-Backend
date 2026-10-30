const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(60000);

let employee;
let tripId;

// Viaje nacional aprobado con fondos para registrar gastos sin factura
beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  const supervisor = api(await login('maria.supervisora'));
  const created = await employee.post('/trip', {
    motivo: 'Viaje para números de recibo', origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
    tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 900,
  });
  tripId = created.body.id_viaje;
  await employee.put(`/trip/${tripId}/submit-review`);
  await supervisor.post(`/review/trip-review/${tripId}/take`);
  await supervisor.post(`/review/trip-review/${tripId}/approve`);
  await api(await login('pedro.aprobador')).post(`/approver/trip/${tripId}/approve`);
  await api(await login('tesoro.prueba')).post(`/treasurer/${tripId}/approve`);
});

// Datos de un gasto sin factura de prueba
const expenseData = (extra = {}) => ({
  id_viaje: tripId, monto_total: 40, fecha_gasto: boliviaDate(), tipo: 'S', descripcion: 'Taxi al cliente', id_categoria_gasto: 1, es_gasto_internacional: false, ...extra,
});

// Cada gasto sin factura recibe su numero de recibo del sistema al registrarse y lo conserva al editarse
test('asigna el número de recibo del sistema al registrar y lo conserva al editar', async () => {
  const first = await employee.postForm('/expense/register', expenseData({numero_recibo: '0003431'}));
  const second = await employee.postForm('/expense/register', expenseData({tipo: 'C', descripcion: 'Compra de agua'}));
  expect(first.status).toBe(200);
  expect(first.body.gasto.numero_recibo_sistema).toMatch(/^\d{6}\/\d{2}-\d{4}$/);
  expect(second.body.gasto.numero_recibo_sistema).not.toBe(first.body.gasto.numero_recibo_sistema);
  const expenseId = first.body.gasto.id_gasto;
  let detail = (await employee.get(`/expense/${expenseId}/detail`)).body;
  const assigned = detail.Recibo[0].numero;
  const [year, month] = detail.Recibo[0].periodo.split('-');
  expect(`${String(assigned).padStart(6, '0')}/${month}-${year}`).toBe(first.body.gasto.numero_recibo_sistema);
  expect(detail.numero_recibo).toBe('0003431');
  const edited = await employee.putForm(`/expense/${expenseId}/update`, expenseData({tipo: 'C', monto_total: 45}));
  expect(edited.status).toBe(200);
  detail = (await employee.get(`/expense/${expenseId}/detail`)).body;
  expect(detail.Recibo).toEqual([{numero: assigned, periodo: `${year}-${month}`}]);
});

// El correlativo de recibos es de cada mes: un mes nuevo empieza en 1
test('el correlativo de recibos vuelve a 1 en cada mes', async () => {
  const supabase = require('../../src/config/supabase');
  const first = await supabase.rpc('incrementar_correlativo_recibo', {p_periodo: '2099-01'});
  const second = await supabase.rpc('incrementar_correlativo_recibo', {p_periodo: '2099-01'});
  const otherMonth = await supabase.rpc('incrementar_correlativo_recibo', {p_periodo: '2099-02'});
  expect([first.data, second.data, otherMonth.data]).toEqual([1, 2, 1]);
});
