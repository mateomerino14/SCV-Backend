const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const expenseCategoryController = require('../../controllers/catalog/expenseCategoryController')

router.get('/', authMiddleware, expenseCategoryController.getAllExpenseCategories)
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR', 'SUPERVISOR']), expenseCategoryController.createExpenseCategory)

module.exports = router;    