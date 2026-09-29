const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const taxController = require('../../controllers/catalog/taxController')

router.get('/', authMiddleware, taxController.getAllTaxes)
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), taxController.updateTax)
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), taxController.createTax)
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), taxController.deleteTax)

module.exports = router;