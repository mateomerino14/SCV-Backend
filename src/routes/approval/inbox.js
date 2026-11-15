const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const requireTreasurerPosition = require('../../middlewares/treasurerPosition');
const inboxController = require('../../controllers/approval/inboxController');

// Cada bandeja pide el mismo rol que sus listas de siempre; responde de a una pagina con los totales por pestana
const inboxGuards = {
  'jefe-viajes-pendientes': roleMiddleware(['SUPERVISOR']),
  'jefe-rendiciones-pendientes': roleMiddleware(['SUPERVISOR']),
  'jefe-historial-viajes': roleMiddleware(['SUPERVISOR', 'APROBADOR']),
  'jefe-historial-rendiciones': roleMiddleware(['SUPERVISOR', 'APROBADOR']),
  'aprobador-viajes': roleMiddleware(['APROBADOR']),
  'aprobador-rendiciones': roleMiddleware(['APROBADOR']),
  revisor: roleMiddleware(['REVISOR']),
  tesoreria: requireTreasurerPosition,
  plazos: roleMiddleware(['REVISOR']),
  reemplazos: roleMiddleware(['REVISOR']),
};

Object.entries(inboxGuards).forEach(([inboxName, guard]) => {
  router.get(`/${inboxName}`, authMiddleware, guard, inboxController.getInbox(inboxName));
});

module.exports = router;
