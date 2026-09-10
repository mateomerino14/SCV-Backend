const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const adminController = require('../../controllers/admin/adminController')

router.get('/dashboard', authMiddleware, roleMiddleware(['ADMINISTRADOR']), adminController.getDashboardStats)

module.exports = router;