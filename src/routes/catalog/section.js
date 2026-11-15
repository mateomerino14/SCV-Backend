const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const sectionController = require('../../controllers/catalog/sectionController');
const catalogImportController = require('../../controllers/catalog/catalogImportController');

router.get('/', authMiddleware, sectionController.getAllSections);
router.post('/import/preview', authMiddleware, roleMiddleware(['ADMINISTRADOR']), catalogImportController.previewSectionImport);
router.post('/import', authMiddleware, roleMiddleware(['ADMINISTRADOR']), catalogImportController.importSections);
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.updateSection);
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.createSection);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.deleteSection);
router.patch('/:id/suspend', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.suspendSection);
router.patch('/:id/activate', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.activateSection);

module.exports = router;
