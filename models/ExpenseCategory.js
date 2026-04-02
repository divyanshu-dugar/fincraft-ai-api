// models/ExpenseCategory.js
const mongoose = require('mongoose');

const expenseCategorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: { type: String, required: true },
  icon: { type: String, default: '💰' },
  color: { type: String, default: '#9CA3AF' },
  // Hierarchical support: null = top-level (parent) category
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpenseCategory',
    default: null,
  },
  // True means this is a parent/group; false/undefined = sub-category leaf
  isParent: { type: Boolean, default: false },
}, {
  timestamps: true
});

// Name must be unique per user per parent level
expenseCategorySchema.index({ user: 1, name: 1, parentCategory: 1 }, { unique: true });

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
