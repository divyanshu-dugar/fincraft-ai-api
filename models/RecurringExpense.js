const mongoose = require('mongoose');

const recurringExpenseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpenseCategory',
      required: true,
    },
    amount: { type: Number, required: true },
    note: { type: String, default: '' },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      required: true,
    },
    startDate: { type: Date, required: true },
    nextDueDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    lastGeneratedDate: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RecurringExpense', recurringExpenseSchema);
