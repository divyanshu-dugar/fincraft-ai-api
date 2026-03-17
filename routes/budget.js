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
    markAlertAsRead
} = require('../controllers/budget');
const requireAuth = require('../auth/require-auth');

// All routes are protected
router.get('/', requireAuth(), getBudgets);
router.get('/stats', requireAuth(), getBudgetStats);
router.get('/alerts', requireAuth(), getUserAlerts);
router.get('/check-alerts', requireAuth(), checkBudgetAlerts);
router.get('/:id', requireAuth(), getBudgetById);
router.post('/', requireAuth(), addBudget);
router.put('/:id', requireAuth(), editBudget);
router.put('/alerts/:id/read', requireAuth(), markAlertAsRead);
router.delete('/:id', requireAuth(), deleteBudget);

module.exports = router;