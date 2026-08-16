const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const invoiceDetailController = require('../../controllers/expense/invoiceDetailController')

router.get('/', authMiddleware, invoiceDetailController.getAllInvoiceDetails)
router.put('/:id', authMiddleware, invoiceDetailController.updateInvoiceDetail)
router.post('/', authMiddleware, invoiceDetailController.createInvoiceDetail)
router.delete('/:id', authMiddleware, invoiceDetailController.deleteInvoiceDetail)

module.exports = router;