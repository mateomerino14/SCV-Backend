const express = require('express')
const router = express.Router()
const authController = require('../../controllers/user/authController')
const loginRateLimiter = require('../../middlewares/loginRateLimiter')
const passwordResetRateLimiter = require('../../middlewares/passwordResetRateLimiter')

router.post('/', loginRateLimiter, authController.login)
router.post('/refresh', authController.refresh)
router.post('/logout', authController.logout)
router.post('/send-code', passwordResetRateLimiter, authController.sendCode)
router.post('/verify-code', passwordResetRateLimiter, authController.verifyCode)

module.exports = router;