const express = require('express')
const router = express.Router()
const multer = require('multer')
const authMiddleware = require('../../middlewares/auth')
const expenseController = require('../../controllers/expense/expenseController')

const maxFileSize = 8 * 1024 * 1024;
const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: maxFileSize, files: 1},
  fileFilter: (req, file, callback) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return callback(new Error('Solo se permiten imágenes JPG, PNG o WEBP'))
    }
    callback(null, true)
  },
})

router.get('/:expenseId/detail', authMiddleware, expenseController.getExpenseDetail)
router.post('/trip/:tripId/receipt/:type', authMiddleware, expenseController.sendGroupedReceipt)
router.post('/:expenseId/receipt', authMiddleware, expenseController.sendIndividualReceipt)
router.post('/register', authMiddleware, upload.single('imagen'), expenseController.registerExpense)
router.put('/:expenseId/update', authMiddleware, upload.single('imagen'), expenseController.updateExpense)
router.delete('/:expenseId', authMiddleware, expenseController.deleteExpense)

module.exports = router;