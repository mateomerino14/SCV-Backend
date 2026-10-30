const express = require('express');
const router = express.Router();
const documentVerifyRateLimiter = require('../../middlewares/documentVerifyRateLimiter');
const documentController = require('../../controllers/document/documentController');

router.get('/verify/:code', documentVerifyRateLimiter, documentController.verifyDocument);

module.exports = router;
