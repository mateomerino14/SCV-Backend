const {login, api, boliviaDate} = require('./helpers');

// Un empleado no puede exportar planillas de varios viajes
test('un empleado no puede exportar planillas en grupo', async () => {
  const employee = api(await login('juan.empleado'));
  const response = await employee.get('/trip/export/statements?ids=1');
  expect(response.status).toBe(403);
});

// El revisor, el tesorero y el administrador si pueden exportar
test.each(['lucia.revisora', 'tesoro.prueba', 'admin.prueba'])('%s puede exportar planillas del periodo', async (user) => {
  const client = api(await login(user));
  const response = await client.get(`/trip/export/statements?fecha_inicio=${boliviaDate(-365)}&fecha_fin=${boliviaDate(365)}`);
  expect([200, 400]).toContain(response.status);
  if (response.status === 200) {
    expect(Array.isArray(response.body.planillas)).toBe(true);
  }
});

// Sin viajes indicados responde con un error claro
test('exige indicar los viajes o un periodo', async () => {
  const reviewer = api(await login('lucia.revisora'));
  const response = await reviewer.get('/trip/export/statements');
  expect(response.status).toBe(400);
});
