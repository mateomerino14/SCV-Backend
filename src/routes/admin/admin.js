const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const adminController = require('../../controllers/admin/adminController')
const reminderController = require('../../controllers/admin/reminderController')

router.get('/dashboard', authMiddleware, roleMiddleware(['ADMINISTRADOR']), adminController.getDashboardStats)
router.get('/reminders', authMiddleware, roleMiddleware(['ADMINISTRADOR']), reminderController.getSchedule)
router.put('/reminders', authMiddleware, roleMiddleware(['ADMINISTRADOR']), reminderController.updateSchedule)
router.get('/reminders/preview', authMiddleware, roleMiddleware(['ADMINISTRADOR']), reminderController.previewDigest)
router.post('/reminders/send-now', authMiddleware, roleMiddleware(['ADMINISTRADOR']), reminderController.sendDigestNow)

module.exports = router;