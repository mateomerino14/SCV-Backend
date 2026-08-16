const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const roleController = require('../../controllers/catalog/roleController')

router.get('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), roleController.getAllRoles)
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), roleController.updateRole)
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), roleController.createRole)
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), roleController.deleteRole)

module.exports = router;