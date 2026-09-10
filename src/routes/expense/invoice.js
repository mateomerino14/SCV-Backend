const express = require('express')
const router = express.Router()
const multer = require('multer')
const authMiddleware = require('../../middlewares/auth')
const invoiceController = require('../../controllers/expense/invoiceController')
const upload = multer({storage: multer.memoryStorage()})

router.post('/extract', authMiddleware, upload.single('factura'), invoiceController.extractInvoice)
router.post('/save', authMiddleware, upload.single('imagen'), invoiceController.saveInvoice)
router.put('/:expenseId/update', authMiddleware, upload.single('imagen'), invoiceController.updateInvoice)

module.exports = router;