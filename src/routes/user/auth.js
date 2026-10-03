const express = require('express');
const router = express.Router();
const authController = require('../../controllers/user/authController');
const loginRateLimiter = require('../../middlewares/loginRateLimiter');
const {sendCodeRateLimiter, verifyCodeRateLimiter} = require('../../middlewares/passwordResetRateLimiter');

router.post('/', loginRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/send-code', sendCodeRateLimiter, authController.sendCode);
router.post('/verify-code', verifyCodeRateLimiter, authController.verifyCode);

module.exports = router;