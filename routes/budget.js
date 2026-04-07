const express = require('express');
const router = express.Router();
const {
    getBudgets,
    getBudgetById,
    addBudget,
    editBudget,
    deleteBudget,
    getBudgetStats,
    checkBudgetAlerts,
    getUserAlerts,
    markAlertAsRead,
    rolloverRecurringBudgets,
    rolloverToTarget,
    clearAlerts,
} = require('../controllers/budget');
const requireAuth = require('../auth/require-auth');

// All routes are protected
router.get('/', requireAuth(), getBudgets);
router.get('/stats', requireAuth(), getBudgetStats);
router.get('/alerts', requireAuth(), getUserAlerts);
router.get('/check-alerts', requireAuth(), checkBudgetAlerts);
router.get('/:id', requireAuth(), getBudgetById);
router.post('/', requireAuth(), addBudget);
router.post('/rollover', requireAuth(), rolloverRecurringBudgets);
router.post('/rollover-to', requireAuth(), rolloverToTarget);
router.put('/:id', requireAuth(), editBudget);
router.put('/alerts/:id/read', requireAuth(), markAlertAsRead);
router.delete('/alerts', requireAuth(), clearAlerts);
router.delete('/:id', requireAuth(), deleteBudget);

module.exports = router;