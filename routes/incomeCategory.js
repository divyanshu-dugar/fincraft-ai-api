const express = require('express');
const passport = require('passport');
const {
  getIncomeCategories,
  addIncomeCategory,
  updateIncomeCategory,
  deleteIncomeCategory,
} = require('../controllers/incomeCategory');

const router = express.Router();
const authenticate = passport.authenticate('jwt', { session: false });

// GET all categories
router.get('/', authenticate, getIncomeCategories);

// POST new category
router.post('/', authenticate, addIncomeCategory);

// PUT update category by id
router.put('/:id', authenticate, updateIncomeCategory);

// DELETE category by id
router.delete('/:id', authenticate, deleteIncomeCategory);

module.exports = router;