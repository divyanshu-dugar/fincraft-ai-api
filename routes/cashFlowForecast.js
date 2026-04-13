const express = require('express');
const router = express.Router();
const requireAuth = require('../auth/require-auth');
const { getForecast } = require('../controllers/cashFlowForecast');

// GET /cash-flow-forecast?months=3
router.get('/', requireAuth(), getForecast);

module.exports = router;
