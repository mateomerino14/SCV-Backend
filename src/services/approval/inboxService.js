const reviewService = require('./reviewService');
const approverService = require('./approverService');
const approverAlcoholReviewService = require('./approverAlcoholReviewService');
const reviewerService = require('./reviewerService');
const treasurerService = require('./treasurerService');
const deadlineAuthorizationService = require('./deadlineAuthorizationService');
const substitutionService = require('./substitutionService');

const defaultPageSize = 12;
const maxPageSize = 100;
const filterKeys = ['fecha_inicio', 'fecha_fin', 'id_empleado', 'id_seccion'];

// Indica si el viaje espera la accion de esta persona en la etapa en que se muestra
const pendingForMe = (stateByStage) => (trip) => trip.estado === stateByStage[trip.etapa] && trip.asignado_a_mi !== false;

// Arma las pestanas de las bandejas: pendientes para mi, aprobados y rechazados, con el nombre que usa cada bandeja
const reviewTabs = (isPending, [pendingTab, approvedTab, rejectedTab]) => ({
  [pendingTab]: isPending,
  [approvedTab]: (trip) => trip.resultado_revision === 'APROBADO' && !isPending(trip),
  [rejectedTab]: (trip) => trip.resultado_revision === 'RECHAZADO',
});

const approverTripPending = pendingForMe({APROBACION: 'APROBADO_VIAJE', JEFE: 'EN_REVISION_VIAJE'});
const approverExpensePending = pendingForMe({NO_DEDUCIBLE: 'EN_REVISION_APROBADOR', JEFE: 'EN_REVISION'});
const reviewerPending = pendingForMe({REVISION: 'APROBADO_SUPERVISOR'});
const supervisorTripPending = pendingForMe({JEFE: 'EN_REVISION_VIAJE'});
const supervisorExpensePending = pendingForMe({JEFE: 'EN_REVISION'});

// Bandejas: de donde salen las filas (cada fuente marca su etapa), si se quitan repetidos y como se reparten en pestanas
const inboxes = {
  'jefe-viajes-pendientes': {
    sources: [{load: reviewService.getPendingTripReviews, etapa: 'JEFE'}],
    tabs: {TODOS: () => true},
  },
  'jefe-rendiciones-pendientes': {
    sources: [{load: reviewService.getPendingExpenseReviews, etapa: 'JEFE'}],
    tabs: {TODOS: () => true, OBSERVADO: (trip) => trip.estadoRevision === 'OBSERVADO', CONFORME: (trip) => trip.estadoRevision === 'CONFORME'},
  },
  'jefe-historial-viajes': {
    sources: [{load: reviewService.getMyTripReviews, etapa: 'JEFE'}],
    tabs: reviewTabs(supervisorTripPending, ['EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'RECHAZADO']),
  },
  'jefe-historial-rendiciones': {
    sources: [{load: reviewService.getMyExpenseReviews, etapa: 'JEFE'}],
    tabs: reviewTabs(supervisorExpensePending, ['EN_REVISION', 'APROBADO_SUPERVISOR', 'RECHAZADO']),
  },
  'aprobador-viajes': {
    sources: [{load: approverService.getMyTrips, etapa: 'APROBACION'}, {load: reviewService.getMyTripReviews, etapa: 'JEFE', optional: true}],
    unique: true,
    tabs: reviewTabs(approverTripPending, ['MIS_PENDIENTES', 'APROBADOS', 'RECHAZADOS']),
  },
  'aprobador-rendiciones': {
    sources: [{load: approverAlcoholReviewService.getMyAlcoholReviews, etapa: 'NO_DEDUCIBLE'}, {load: reviewService.getMyExpenseReviews, etapa: 'JEFE', optional: true}],
    unique: true,
    tabs: reviewTabs(approverExpensePending, ['MIS_PENDIENTES', 'APROBADOS', 'RECHAZADOS']),
  },
  revisor: {
    sources: [{load: reviewerService.getMyReviews, etapa: 'REVISION'}],
    tabs: reviewTabs(reviewerPending, ['MIS_PENDIENTES', 'APROBADOS', 'RECHAZADOS']),
  },
  tesoreria: {
    sources: [{load: treasurerService.getPendingTrips, etapa: 'PENDIENTE'}, {load: treasurerService.getMyTrips, etapa: 'REVISADO'}],
    tabs: {
      PENDIENTES: (trip) => trip.etapa === 'PENDIENTE',
      APROBADOS: (trip) => trip.etapa === 'REVISADO' && trip.resultado_revision === 'APROBADO' && !(trip.estado === 'EN_REVISION_TESORERO' && trip.asignado_a_mi !== false),
      RECHAZADOS: (trip) => trip.etapa === 'REVISADO' && trip.resultado_revision === 'RECHAZADO',
    },
  },
  plazos: {
    sources: [{load: deadlineAuthorizationService.getPendingRequests, etapa: 'PENDIENTE', key: 'requests'}, {load: deadlineAuthorizationService.getRequestHistory, etapa: 'HISTORIAL', key: 'requests'}],
    tabs: {PENDIENTES: (request) => request.etapa === 'PENDIENTE', HISTORIAL: (request) => request.etapa === 'HISTORIAL'},
  },
  reemplazos: {
    sources: [{load: substitutionService.getPendingRequests, etapa: 'PENDIENTE', key: 'requests'}, {load: substitutionService.getRequestHistory, etapa: 'HISTORIAL', key: 'requests'}],
    tabs: {PENDIENTES: (request) => request.etapa === 'PENDIENTE', HISTORIAL: (request) => request.etapa === 'HISTORIAL'},
  },
};

// Toma de la consulta solo los filtros de fecha, empleado y seccion que usan las bandejas
const filtersOf = (query) => Object.fromEntries(filterKeys.filter((key) => query[key]).map((key) => [key, query[key]]));

// Quita los viajes repetidos entre fuentes y deja el primero que aparece
const withoutRepeats = (rows) => rows.filter((row, index) => rows.findIndex((other) => other.id_viaje === row.id_viaje) === index);

// Arma una pagina de la bandeja: carga sus fuentes como antes, reparte las filas en pestanas y devuelve la pagina pedida con los totales de cada pestana
const getInboxPage = async (inboxName, userId, query) => {
  const inbox = inboxes[inboxName];
  const filters = filtersOf(query);
  const results = await Promise.all(inbox.sources.map((source) => source.load(userId, filters)));
  let rows = [];
  for (let index = 0; index < results.length; index++) {
    const source = inbox.sources[index];
    const result = results[index];
    if (result.error) {
      if (source.optional) {
        continue;
      }
      return {error: result.error, status: 500};
    }
    rows = [...rows, ...(result[source.key || 'trips'] || []).map((row) => ({...row, etapa: source.etapa}))];
  }
  const tabNames = Object.keys(inbox.tabs);
  let tab = tabNames[0];
  if (tabNames.includes(query.tab)) {
    tab = query.tab;
  }
  const counts = {};
  let tabRows = [];
  tabNames.forEach((name) => {
    let matching = rows.filter(inbox.tabs[name]);
    if (inbox.unique) {
      matching = withoutRepeats(matching);
    }
    counts[name] = matching.length;
    if (name === tab) {
      tabRows = matching;
    }
  });
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxPageSize, Math.max(1, parseInt(query.limit, 10) || defaultPageSize));
  return {page: {items: tabRows.slice((page - 1) * limit, page * limit), total: tabRows.length, counts, tab, page, limit}};
};

module.exports = {inboxNames: Object.keys(inboxes), getInboxPage};
