const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: { 
        type: String, 
        required: true,
        trim: true
    },
    amount: { 
        type: Number, 
        required: true,
        min: 0
    },
    period: {
        type: String,
        enum: ['weekly', 'monthly', 'yearly'],
        default: 'monthly'
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExpenseCategory',
        required: true
    },
    startDate: { 
        type: Date, 
        required: true 
    },
    endDate: { 
        type: Date, 
        required: true 
    },
    isActive: {
        type: Boolean,
        default: true
    },
    notifications: {
        type: Boolean,
        default: true
    },
    alertThreshold: {
        type: Number,
        default: 80, // Percentage
        min: 0,
        max: 100
    },
    embedding: {
        type: [Number],
        required: false
    }
}, {
    timestamps: true
});

// Index for efficient queries
budgetSchema.index({ user: 1, category: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Budget', budgetSchema);