const express = require('express');
const router = express.Router();
const {
    getIncomes,
    getIncomeById,
    addIncome,
    editIncome,
    deleteIncome,
    getIncomesByCategory,
    getIncomeStats,
    getIncomesByCategoryAndDateRange,
    getIncomeCategoryMonthComparison,
    bulkDeleteIncomes,
    bulkRecategorize,
    bulkEditDate,
} = require('../controllers/income');
const requireAuth = require('../auth/require-auth');

// All routes are protected
router.get('/', requireAuth(), getIncomes);
router.get('/stats', requireAuth(), getIncomeStats);
router.get('/analytics/category-month-comparison', requireAuth(), getIncomeCategoryMonthComparison);
router.get('/category/:category', requireAuth(), getIncomesByCategory);
router.get('/category/:category/date-range', requireAuth(), getIncomesByCategoryAndDateRange);
router.get('/:id', requireAuth(), getIncomeById);
router.post('/', requireAuth(), addIncome);
router.post('/bulk-delete', requireAuth(), bulkDeleteIncomes);
router.post('/bulk-recategorize', requireAuth(), bulkRecategorize);
router.post('/bulk-edit-date', requireAuth(), bulkEditDate);
router.put('/:id', requireAuth(), editIncome);
router.delete('/:id', requireAuth(), deleteIncome);

module.exports = router;