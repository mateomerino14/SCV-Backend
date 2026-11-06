const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const auditController = require('../../controllers/catalog/auditController');

router.get('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), auditController.getAllAudits);

module.exports = router;
