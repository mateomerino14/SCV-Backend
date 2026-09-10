const express = require('express')
const router = express.Router()
const authController = require('../../controllers/user/authController')
const loginRateLimiter = require('../../middlewares/loginRateLimiter')

router.post('/', loginRateLimiter, authController.login)
router.post('/refresh', authController.refresh)
router.post('/logout', authController.logout)
router.post('/send-code', loginRateLimiter, authController.sendCode)
router.post('/verify-code', loginRateLimiter, authController.verifyCode)

module.exports = router;