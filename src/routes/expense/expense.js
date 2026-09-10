const express = require('express')
const router = express.Router()
const multer = require('multer')
const authMiddleware = require('../../middlewares/auth')
const expenseController = require('../../controllers/expense/expenseController')
const upload = multer({storage: multer.memoryStorage()})

router.get('/:expenseId/detail', authMiddleware, expenseController.getExpenseDetail)
router.post('/trip/:tripId/receipt/:type', authMiddleware, expenseController.sendGroupedReceipt)
router.post('/:expenseId/receipt', authMiddleware, expenseController.sendIndividualReceipt)
router.post('/register', authMiddleware, upload.single('imagen'), expenseController.registerExpense)
router.put('/:expenseId/update', authMiddleware, upload.single('imagen'), expenseController.updateExpense)
router.delete('/:expenseId', authMiddleware, expenseController.deleteExpense)

module.exports = router;