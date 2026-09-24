const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const auditController = require('../../controllers/catalog/auditController')

router.get('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), auditController.getAllAudits)
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), auditController.createAudit)
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), auditController.deleteAudit)

module.exports = router;
