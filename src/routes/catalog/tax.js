const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const taxController = require('../../controllers/catalog/taxController')

router.get('/', authMiddleware, taxController.getAllTaxes)
router.put('/:id', authMiddleware, taxController.updateTax)
router.post('/', authMiddleware, taxController.createTax)
router.delete('/:id', authMiddleware, taxController.deleteTax)

module.exports = router;