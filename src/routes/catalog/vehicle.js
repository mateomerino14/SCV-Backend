const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const vehicleController = require('../../controllers/catalog/vehicleController');

router.get('/available', authMiddleware, vehicleController.getAvailableVehicles);
router.get('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), vehicleController.getAllVehicles);
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), vehicleController.createVehicle);
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), vehicleController.updateVehicle);
router.patch('/:id/suspend', authMiddleware, roleMiddleware(['ADMINISTRADOR']), vehicleController.suspendVehicle);
router.patch('/:id/activate', authMiddleware, roleMiddleware(['ADMINISTRADOR']), vehicleController.activateVehicle);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), vehicleController.deleteVehicle);

module.exports = router;
