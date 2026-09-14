const express = require('express')
const router = express.Router()
const multer = require('multer')
const authMiddleware = require('../../middlewares/auth')
const invoiceController = require('../../controllers/expense/invoiceController')

const maxFileSize = 8 * 1024 * 1024;
const allowedInvoiceTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: maxFileSize, files: 1},
  fileFilter: (req, file, callback) => {
    if (!allowedInvoiceTypes.includes(file.mimetype)) {
      return callback(new Error('Solo se permiten imágenes JPG, PNG, WEBP o archivos PDF'))
    }
    callback(null, true)
  },
})

router.post('/extract', authMiddleware, upload.single('factura'), invoiceController.extractInvoice)
router.post('/save', authMiddleware, upload.single('imagen'), invoiceController.saveInvoice)
router.put('/:expenseId/update', authMiddleware, upload.single('imagen'), invoiceController.updateInvoice)

module.exports = router;