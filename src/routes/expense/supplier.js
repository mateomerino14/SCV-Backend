const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const supplierController = require('../../controllers/expense/supplierController')

router.get('/', authMiddleware, supplierController.getAllSuppliers)
router.put('/:id', authMiddleware, supplierController.updateSupplier)
router.post('/', authMiddleware, supplierController.createSupplier)
router.delete('/:id', authMiddleware, supplierController.deleteSupplier)

module.exports = router;