const express = require('express');
const requireAuth = require('../auth/require-auth');
const {
  getIncomeCategories,
  addIncomeCategory,
  updateIncomeCategory,
  deleteIncomeCategory,
} = require('../controllers/incomeCategory');

const router = express.Router();
const authenticate = requireAuth();

// GET all categories
router.get('/', authenticate, getIncomeCategories);

// POST new category
router.post('/', authenticate, addIncomeCategory);

// PUT update category by id
router.put('/:id', authenticate, updateIncomeCategory);

// DELETE category by id
router.delete('/:id', authenticate, deleteIncomeCategory);

module.exports = router;