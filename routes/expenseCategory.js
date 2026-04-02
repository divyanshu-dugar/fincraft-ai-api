const express = require('express');
const passport = require('passport');
const requireAuth = require('../auth/require-auth');
const {
  getExpenseCategories,
  addExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  seedDefaultCategories,
} = require('../controllers/expenseCategory');

const router = express.Router();
const authenticate = requireAuth();

// POST seed default categories (must be before /:id to avoid param collision)
router.post('/seed', authenticate, seedDefaultCategories);

// GET all categories (tree by default, ?flat=true for legacy flat array)
router.get('/', authenticate, getExpenseCategories);

// POST new category
router.post('/', authenticate, addExpenseCategory);

// PUT update category by id
router.put('/:id', authenticate, updateExpenseCategory);

// DELETE category by id
router.delete('/:id', authenticate, deleteExpenseCategory);

module.exports = router;
