const mongoose = require("mongoose");

const incomeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: Date, required: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncomeCategory", // 👈 reference to ExpenseCategory model
      required: true,
    },
    amount: { type: Number, required: true },
    note: { type: String },
    embedding: {
      type: [Number],
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Income", incomeSchema);
