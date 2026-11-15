const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const travelScaleController = require('../../controllers/catalog/travelScaleController');

router.get('/', authMiddleware, travelScaleController.getScale);
router.put('/:tipo', authMiddleware, roleMiddleware(['ADMINISTRADOR']), travelScaleController.updateScale);

module.exports = router;
