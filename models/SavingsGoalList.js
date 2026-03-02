const mongoose = require("mongoose");

const savingsGoalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    deadline: { type: Date, required: true },
    priority: { type: String, required: true },
    description: { type: String },
    currentAmount: { type: Number, default: 0 },
    savedAmount: { type: Number, default: 0, min: 0 },
    embedding: {
        type: [Number],
        required: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("SavingsGoal", savingsGoalSchema);