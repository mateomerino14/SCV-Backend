const {login, api, boliviaDate} = require('./helpers');

jest.setTimeout(120000);

const inboxesByUser = {
  'maria.supervisora': {
    'jefe-viajes-pendientes': ['TODOS'],
    'jefe-rendiciones-pendientes': ['TODOS', 'OBSERVADO', 'CONFORME'],
    'jefe-historial-viajes': ['EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'RECHAZADO'],
    'jefe-historial-rendiciones': ['EN_REVISION', 'APROBADO_SUPERVISOR', 'RECHAZADO'],
  },
  'pedro.aprobador': {
    'aprobador-viajes': ['MIS_PENDIENTES', 'APROBADOS', 'RECHAZADOS'],
    'aprobador-rendiciones': ['MIS_PENDIENTES', 'APROBADOS', 'RECHAZADOS'],
    'jefe-historial-viajes': ['EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'RECHAZADO'],
  },
  'lucia.revisora': {
    revisor: ['MIS_PENDIENTES', 'APROBADOS', 'RECHAZADOS'],
    plazos: ['PENDIENTES', 'HISTORIAL'],
    reemplazos: ['PENDIENTES', 'HISTORIAL'],
  },
  'tesoro.prueba': {
    tesoreria: ['PENDIENTES', 'APROBADOS', 'RECHAZADOS'],
  },
};
const clients = {};

// Recorre todas las paginas de una pestana de a 2 filas y junta las filas
const allPagesOf = async (client, inbox, tab) => {
  const rows = [];
  for (let page = 1; page < 500; page++) {
    const response = await client.get(`/inbox/${inbox}?tab=${tab}&page=${page}&limit=2`);
    rows.push(...response.body.items);
    if (rows.length >= response.body.total || response.body.items.length === 0) {
      return {rows, total: response.body.total};
    }
  }
  return {rows, total: -1};
};

// Crea viajes enviados a revision para que las bandejas del jefe y del aprobador tengan filas
beforeAll(async () => {
  for (const user of Object.keys(inboxesByUser)) {
    clients[user] = api(await login(user));
  }
  const employee = api(await login('juan.empleado'));
  for (let index = 0; index < 3; index++) {
    const created = await employee.post('/trip', {
      motivo: `Viaje para la bandeja ${index}`, origen: 'La Paz', destino: 'Oruro', fecha_inicio: boliviaDate(20 + index), fecha_fin: boliviaDate(21 + index),
      tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 460,
    });
    await employee.put(`/trip/${created.body.id_viaje}/submit-review`);
  }
});

// Cada bandeja responde de a una pagina, con los totales de todas sus pestanas, sin repetir filas entre paginas
test('todas las bandejas se paginan en el servidor con sus pestañas', async () => {
  for (const [user, inboxes] of Object.entries(inboxesByUser)) {
    for (const [inbox, tabs] of Object.entries(inboxes)) {
      const first = await clients[user].get(`/inbox/${inbox}`);
      expect(first.status).toBe(200);
      expect(Object.keys(first.body.counts)).toEqual(tabs);
      expect(first.body.tab).toBe(tabs[0]);
      for (const tab of tabs) {
        const {rows, total} = await allPagesOf(clients[user], inbox, tab);
        expect(total).toBe(first.body.counts[tab]);
        expect(rows).toHaveLength(total);
        const keys = rows.map((row) => `${row.id_viaje}-${row.id_solicitud || row.id || ''}-${row.etapa}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  }
});

// Los viajes que el equipo envia quedan en la pestana de pendientes del jefe, del mas reciente al mas antiguo
test('la bandeja del jefe trae como pendientes los viajes que envió su equipo', async () => {
  const supervisor = clients['maria.supervisora'];
  const {rows} = await allPagesOf(supervisor, 'jefe-historial-viajes', 'EN_REVISION_VIAJE');
  const sent = rows.filter((trip) => trip.motivo.startsWith('Viaje para la bandeja'));
  expect(sent).toHaveLength(3);
  expect(sent.every((trip) => trip.estado === 'EN_REVISION_VIAJE' && trip.etapa === 'JEFE')).toBe(true);
  const approved = await allPagesOf(supervisor, 'jefe-historial-viajes', 'APROBADO_VIAJE');
  expect(approved.rows.some((trip) => trip.motivo.startsWith('Viaje para la bandeja'))).toBe(false);
});

// Cada bandeja exige el mismo rol que su lista; los filtros y el tamano de pagina se validan
test('las bandejas piden el rol correcto y limitan el tamaño de la página', async () => {
  const employee = api(await login('juan.empleado'));
  expect((await employee.get('/inbox/revisor')).status).toBe(403);
  expect((await employee.get('/inbox/aprobador-viajes')).status).toBe(403);
  expect((await clients['maria.supervisora'].get('/inbox/aprobador-viajes')).status).toBe(403);
  expect((await clients['lucia.revisora'].get('/inbox/tesoreria')).status).toBe(403);
  const huge = await clients['maria.supervisora'].get('/inbox/jefe-historial-viajes?limit=9999&tab=NO_EXISTE');
  expect(huge.body.limit).toBe(100);
  expect(huge.body.tab).toBe('EN_REVISION_VIAJE');
  const future = await clients['maria.supervisora'].get(`/inbox/jefe-historial-viajes?fecha_inicio=${boliviaDate(400)}`);
  expect(future.body.total).toBe(0);
});
