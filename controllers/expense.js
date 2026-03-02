const generateEmbedding = require('../utils/generateEmbedding');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const mongoose = require('mongoose');

/**
 * Helper: Resolve category input (either ObjectId string or category name)
 */
async function resolveCategory(categoryInput, userId) {
  if (!categoryInput) return null;

  // If ObjectId-like, check existence (within user's categories)
  if (mongoose.Types.ObjectId.isValid(String(categoryInput))) {
    const cat = await ExpenseCategory.findOne({
      _id: String(categoryInput),
      user: userId,
    });
    if (cat) return cat._id;
  }

  // Otherwise, treat input as a name (case-insensitive)
  const name = String(categoryInput).trim();
  if (!name) return null;

  const existing = await ExpenseCategory.findOne({
    user: userId,
    name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' },
  });

  if (existing) return existing._id;

  // If not found, create a new one for this user
  const newCat = new ExpenseCategory({
    user: userId,
    name,
    color: '#9CA3AF',
    icon: '💰',
  });
  await newCat.save();
  return newCat._id;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* =============================
   GET ALL EXPENSES (user-specific) WITH DATE RANGE SUPPORT
============================= */
exports.getExpenses = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Build query object
    let query = { user: req.user._id };

    // Check for date range query parameters
    const { startDate, endDate } = req.query;
    
    if (startDate && endDate) {
      const startLocal = new Date(startDate);
      const endLocal = new Date(endDate);

      const start = new Date(Date.UTC(
        startLocal.getFullYear(),
        startLocal.getMonth(),
        startLocal.getDate()
      ));

      const end = new Date(Date.UTC(
        endLocal.getFullYear(),
        endLocal.getMonth(),
        endLocal.getDate(),
        23, 59, 59, 999
      ));

      query.date = { $gte: start, $lte: end };
    }

    const expenses = await Expense.find(query)
      .populate('category', 'name color icon')
      .sort({ date: -1 });
    
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET EXPENSE BY ID
============================= */
exports.getExpenseById = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const expense = await Expense.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate('category', 'name color icon');

    if (!expense)
      return res.status(404).json({ message: 'Expense not found' });

    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   ADD NEW EXPENSE
============================= */
exports.addExpense = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { date, category, amount, note } = req.body;

    
    if (!date || amount == null) {
      return res.status(400).json({ message: 'Date and amount are required' });
    }
    
    if (isNaN(Number(amount))) {
      return res.status(400).json({ message: 'Amount must be a number' });
    }
    
    const categoryId = await resolveCategory(category, req.user._id); // ✅ Added userId
    if (!categoryId) {
      return res.status(400).json({ message: 'Invalid or empty category' });
    }
    
    const localDate = new Date(date);
    const utcDate = new Date(Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate()
    ));
    
    const semanticText = `Expense of ${amount} for ${category} on ${date}. Description: ${note || 'None'}`;

    const embeddingArray = await generateEmbedding(semanticText);

    const expense = new Expense({
      user: req.user._id,
      date: utcDate,
      category: categoryId,
      amount,
      note,
      embedding: embeddingArray
    });

    await expense.save();
    await expense.populate('category', 'name color icon');

    res.status(201).json({
      message: 'Expense created successfully',
      expense,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   UPDATE EXPENSE
============================= */
exports.editExpense = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { date, category, amount, note } = req.body;

    let categoryId;
    if (category) {
      categoryId = await resolveCategory(category, req.user._id); // ✅ Added userId
      if (!categoryId)
        return res.status(400).json({ message: 'Invalid category' });
    }

    const updateObj = { amount, note };

    if (date) {
      const localDate = new Date(date);
      updateObj.date = new Date(Date.UTC(
        localDate.getFullYear(),
        localDate.getMonth(),
        localDate.getDate()
      ));
    }

    if (categoryId) updateObj.category = categoryId;

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id }, // ✅ User check
      updateObj,
      { new: true }
    ).populate('category', 'name color icon');

    if (!expense)
      return res.status(404).json({ message: 'Expense not found' });

    const semanticText = `Expense of ${expense.amount} for ${expense.category ? expense.category.name : 'Unknown'} on ${expense.date}. Description: ${expense.note || 'None'}`;
    const embeddingArray = await generateEmbedding(semanticText);
    
    expense.embedding = embeddingArray;
    await expense.save();

    res.json({
      message: 'Expense updated successfully',
      expense,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   DELETE EXPENSE
============================= */
exports.deleteExpense = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id, // ✅ User check
    });

    if (!expense)
      return res.status(404).json({ message: 'Expense not found' });

    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET EXPENSES BY CATEGORY
============================= */
exports.getExpensesByCategory = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const categoryParam = req.params.category;
    if (!categoryParam)
      return res.status(400).json({ message: 'Category parameter required' });

    const categoryId = await resolveCategory(categoryParam, req.user._id);
    if (!categoryId) return res.json([]);

    const expenses = await Expense.find({
      user: req.user._id,
      category: categoryId,
    })
      .populate('category', 'name color icon')
      .sort({ date: -1 });

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET EXPENSES BY DATE RANGE
============================= */
exports.getExpensesByDateRange = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({ message: 'startDate and endDate required' });

    const startLocal = new Date(startDate);
    const endLocal = new Date(endDate);

    const start = new Date(Date.UTC(
      startLocal.getFullYear(),
      startLocal.getMonth(),
      startLocal.getDate()
    ));

    const end = new Date(Date.UTC(
      endLocal.getFullYear(),
      endLocal.getMonth(),
      endLocal.getDate(),
      23, 59, 59, 999
    ));

    const expenses = await Expense.find({
      user: req.user._id,
      date: { $gte: start, $lte: end },
    })
      .populate('category', 'name color icon')
      .sort({ date: -1 });

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET EXPENSE STATS WITH DATE RANGE SUPPORT
============================= */
exports.getExpenseStats = async (req, res) => {
  try {
    if (!req.user || !req.user._id)
      return res.status(401).json({ error: 'Unauthorized' });

    const userId = new mongoose.Types.ObjectId(req.user._id);

    // Build match stage for aggregation
    let matchStage = { user: userId };

    // Check for date range query parameters
    const { startDate, endDate } = req.query;
    
    if (startDate && endDate) {
      const startLocal = new Date(startDate);
      const endLocal = new Date(endDate);

      const start = new Date(Date.UTC(
        startLocal.getFullYear(),
        startLocal.getMonth(),
        startLocal.getDate()
      ));

      const end = new Date(Date.UTC(
        endLocal.getFullYear(),
        endLocal.getMonth(),
        endLocal.getDate(),
        23, 59, 59, 999
      ));

      matchStage.date = { $gte: start, $lte: end };
    }

    const categoryStats = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    const populatedStats = await Promise.all(
      categoryStats.map(async (stat) => {
        const category = await ExpenseCategory.findById(stat._id);
        return {
          name: category ? category.name : 'Unknown',
          totalAmount: stat.totalAmount,
          count: stat.count,
        };
      })
    );

    const totals = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    const totalExpenses = totals[0]?.totalExpenses || 0;
    const totalTransactions = totals[0]?.totalTransactions || 0;
    const avgExpense = totalTransactions ? totalExpenses / totalTransactions : 0;

    res.json({
      categoryStats: populatedStats,
      totalExpenses,
      totalTransactions,
      avgExpense,
    });
  } catch (err) {
    console.error('Error getting expense stats:', err);
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET EXPENSES BY CATEGORY + DATE RANGE
============================= */
exports.getExpensesByCategoryAndDateRange = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { category } = req.params;
    const { startDate, endDate } = req.query;

    if (!category)
      return res.status(400).json({ message: 'Category parameter required' });

    if (!startDate || !endDate)
      return res.status(400).json({ message: 'startDate and endDate required' });

    const categoryId = await resolveCategory(category, req.user._id); // ✅ Added userId
    if (!categoryId) return res.json([]);

    const startLocal = new Date(startDate);
    const endLocal = new Date(endDate);

    const start = new Date(Date.UTC(
      startLocal.getFullYear(),
      startLocal.getMonth(),
      startLocal.getDate()
    ));

    const end = new Date(Date.UTC(
      endLocal.getFullYear(),
      endLocal.getMonth(),
      endLocal.getDate(),
      23, 59, 59, 999
    ));

    const expenses = await Expense.find({
      user: req.user._id,
      category: categoryId,
      date: { $gte: start, $lte: end },
    })
      .populate('category', 'name color icon')
      .sort({ date: -1 });

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   IMPORT EXPENSES FROM CSV/EXCEL
============================= */
exports.importExpenses = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { expenses } = req.body;

    if (!expenses || !Array.isArray(expenses)) {
      return res.status(400).json({ message: 'Invalid expenses data' });
    }

    const importedExpenses = [];
    const errors = [];

    for (const [index, expenseData] of expenses.entries()) {
      try {
        const { date, category, amount, note } = expenseData;

        // Validate required fields
        if (!date || amount == null) {
          errors.push(`Row ${index + 1}: Date and amount are required`);
          continue;
        }

        if (isNaN(Number(amount))) {
          errors.push(`Row ${index + 1}: Amount must be a number`);
          continue;
        }

        // Resolve category
        const categoryId = await resolveCategory(category, req.user._id);
        if (!categoryId) {
          errors.push(`Row ${index + 1}: Invalid or empty category`);
          continue;
        }

        // Convert date to UTC
        const localDate = new Date(date);
        const utcDate = new Date(Date.UTC(
          localDate.getFullYear(),
          localDate.getMonth(),
          localDate.getDate()
        ));

        const expense = new Expense({
          user: req.user._id,
          date: utcDate,
          category: categoryId,
          amount: Number(amount),
          note: note || '',
        });

        await expense.save();
        await expense.populate('category', 'name color icon');
        importedExpenses.push(expense);
      } catch (error) {
        errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    res.json({
      message: `Successfully imported ${importedExpenses.length} expenses`,
      importedCount: importedExpenses.length,
      errors: errors,
      expenses: importedExpenses
    });

  } catch (err) {
    console.error('Error importing expenses:', err);
    res.status(500).json({ error: err.message });
  }
};