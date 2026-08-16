const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const positionController = require('../../controllers/catalog/positionController')

router.get('/', authMiddleware, positionController.getAllPositions)
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.updatePosition)
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.createPosition)
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.deletePosition)
router.patch('/:id/suspend', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.suspendPosition)
router.patch('/:id/activate', authMiddleware, roleMiddleware(['ADMINISTRADOR']), positionController.activatePosition)

module.exports = router;