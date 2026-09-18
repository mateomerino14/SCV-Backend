const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const sectionController = require('../../controllers/catalog/sectionController')

router.get('/', authMiddleware, sectionController.getAllSections)
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.updateSection)
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.createSection)
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.deleteSection)
router.patch('/:id/suspend', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.suspendSection)
router.patch('/:id/activate', authMiddleware, roleMiddleware(['ADMINISTRADOR']), sectionController.activateSection)

module.exports = router;
