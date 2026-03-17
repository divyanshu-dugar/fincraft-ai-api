const express = require('express');
const router = express.Router();
const {
    getExpenses,
    getExpenseById,
    addExpense,
    editExpense,
    deleteExpense,
    getExpensesByCategory,
    getExpenseStats,
    getExpensesByCategoryAndDateRange,
    importExpenses
} = require('../controllers/expense');
const requireAuth = require('../auth/require-auth');

// All routes are protected
router.get('/', requireAuth(), getExpenses);
router.get('/stats', requireAuth(), getExpenseStats);
router.get('/category/:category', requireAuth(), getExpensesByCategory);
router.get('/category/:category/date-range', requireAuth(), getExpensesByCategoryAndDateRange); 
router.get('/:id', requireAuth(), getExpenseById);
router.post('/', requireAuth(), addExpense);
router.post('/import', requireAuth(), importExpenses); 
router.put('/:id', requireAuth(), editExpense);
router.delete('/:id', requireAuth(), deleteExpense);

module.exports = router;