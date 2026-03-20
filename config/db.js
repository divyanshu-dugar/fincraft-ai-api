const mongoose = require('mongoose');
require('dotenv').config()

async function ensureExpenseCategoryIndexes() {
    try {
        const ExpenseCategory = require('../models/ExpenseCategory');
        // Detect and drop legacy global unique index on `name` (breaks per-user categories)
        const indexes = await ExpenseCategory.collection.indexes();
        const legacyNameIndex = indexes.find((idx) => {
            const key = idx?.key || {};
            const isNameOnly = Object.keys(key).length === 1 && key.name === 1;
            return isNameOnly && idx.unique === true;
        });

        if (legacyNameIndex?.name) {
            console.warn(`Dropping legacy unique index on expense categories: ${legacyNameIndex.name}`);
            await ExpenseCategory.collection.dropIndex(legacyNameIndex.name);
        }

        // Ensure schema-defined indexes exist: { user: 1, name: 1 } unique
        await ExpenseCategory.syncIndexes();
        console.log('ExpenseCategory indexes synced');
    } catch (err) {
        console.error('Failed to ensure ExpenseCategory indexes:', err.message);
    }
}

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB connected');

        await ensureExpenseCategoryIndexes();
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
