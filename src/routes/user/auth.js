const express = require('express')
const router = express.Router()
const authController = require('../../controllers/user/authController')

router.post('/', authController.login)
router.post('/refresh', authController.refresh)
router.post('/logout', authController.logout)
router.post('/send-code', authController.sendCode)
router.post('/verify-code', authController.verifyCode)

module.exports = router;