const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const positionController = require('../../controllers/catalog/positionController');
const catalogImportController = require('../../controllers/catalog/catalogImportController');

router.get('/', authMiddleware, positionController.getAllPositions);
router.post('/import/preview', authMiddleware, roleMiddleware(['ADMINISTRADOR']), catalogImportController.previewPositionImport);
router.post('/import', authMiddleware, roleMiddleware(['ADMINISTRADOR']), catalogImportController.importPositions);
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.updatePosition);
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.createPosition);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.deletePosition);
router.patch('/:id/suspend', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.suspendPosition);
router.patch('/:id/activate', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.activatePosition);

module.exports = router;