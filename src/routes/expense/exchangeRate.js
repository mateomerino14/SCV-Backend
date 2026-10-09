const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const exchangeRateController = require('../../controllers/expense/exchangeRateController');

router.get('/', authMiddleware, exchangeRateController.getDailyRate);
router.get('/currencies', authMiddleware, exchangeRateController.getSupportedCurrencies);

module.exports = router;
