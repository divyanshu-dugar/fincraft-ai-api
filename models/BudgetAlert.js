const mongoose = require('mongoose');

const budgetAlertSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    budget: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Budget',
        required: true
    },
    type: {
        type: String,
        enum: ['threshold_reached', 'budget_exceeded', 'budget_almost_exceeded'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    currentSpent: {
        type: Number,
        required: true
    },
    budgetAmount: {
        type: Number,
        required: true
    },
    percentage: {
        type: Number,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Auto-expire READ alerts after 60 days — unread alerts are never touched
budgetAlertSchema.index(
    { updatedAt: 1 },
    { expireAfterSeconds: 60 * 24 * 60 * 60, partialFilterExpression: { isRead: true } }
);

module.exports = mongoose.model('BudgetAlert', budgetAlertSchema);