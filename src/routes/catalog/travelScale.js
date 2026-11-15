const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const travelScaleController = require('../../controllers/catalog/travelScaleController');

router.get('/', authMiddleware, travelScaleController.getScale);
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), travelScaleController.createScale);
router.put('/:tipo', authMiddleware, roleMiddleware(['ADMINISTRADOR']), travelScaleController.updateScale);
router.delete('/:tipo', authMiddleware, roleMiddleware(['ADMINISTRADOR']), travelScaleController.deleteScale);

module.exports = router;
