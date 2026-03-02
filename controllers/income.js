const Income = require('../models/Income');
const IncomeCategory = require('../models/IncomeCategory');
const mongoose = require('mongoose');
const generateEmbedding = require('../utils/generateEmbedding');

/**
 * Helper: Resolve category input (either ObjectId string or category name)
 */
async function resolveIncomeCategory(categoryInput, userId) {
  if (!categoryInput) return null;

  // If ObjectId-like, check existence (within user's categories)
  if (mongoose.Types.ObjectId.isValid(String(categoryInput))) {
    const cat = await IncomeCategory.findOne({
      _id: String(categoryInput),
      user: userId,
    });
    if (cat) return cat._id;
  }

  // Otherwise, treat input as a name (case-insensitive)
  const name = String(categoryInput).trim();
  if (!name) return null;

  const existing = await IncomeCategory.findOne({
    user: userId,
    name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' },
  });

  if (existing) return existing._id;

  // If not found, create a new one for this user
  const newCat = new IncomeCategory({
    user: userId,
    name,
    color: '#10B981',
    icon: '💰',
  });
  await newCat.save();
  return newCat._id;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* =============================
   GET ALL INCOMES (user-specific) WITH DATE RANGE SUPPORT
============================= */
exports.getIncomes = async (req, res) => {
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

    const incomes = await Income.find(query)
      .populate('category', 'name color icon')
      .sort({ date: -1 });
    
    res.json(incomes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET INCOME BY ID
============================= */
exports.getIncomeById = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const income = await Income.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate('category', 'name color icon');

    if (!income)
      return res.status(404).json({ message: 'Income not found' });

    res.json(income);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   ADD NEW INCOME
============================= */
exports.addIncome = async (req, res) => {
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

    const categoryId = await resolveIncomeCategory(category, req.user._id);
    if (!categoryId) {
      return res.status(400).json({ message: 'Invalid or empty category' });
    }

    const localDate = new Date(date);
    const utcDate = new Date(Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate()
    ));

    const semanticText = `Income of ${amount} for category ${category} on ${date}. Description: ${note || 'None'}`;
    const embeddingArray = await generateEmbedding(semanticText);

    const income = new Income({
      user: req.user._id,
      date: utcDate,
      category: categoryId,
      amount,
      note,
      embedding: embeddingArray
    });

    await income.save();
    await income.populate('category', 'name color icon');

    res.status(201).json({
      message: 'Income created successfully',
      income,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   UPDATE INCOME
============================= */
exports.editIncome = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { date, category, amount, note } = req.body;

    let categoryId;
    if (category) {
      categoryId = await resolveIncomeCategory(category, req.user._id);
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

    const income = await Income.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateObj,
      { new: true }
    ).populate('category', 'name color icon');

    if (!income)
      return res.status(404).json({ message: 'Income not found' });

    const semanticText = `Income of ${income.amount} for category ${income.category ? income.category.name : 'Unknown'} on ${income.date}. Description: ${income.note || 'None'}`;
    const embeddingArray = await generateEmbedding(semanticText);
    
    income.embedding = embeddingArray;
    await income.save();

    res.json({
      message: 'Income updated successfully',
      income,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   DELETE INCOME
============================= */
exports.deleteIncome = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const income = await Income.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!income)
      return res.status(404).json({ message: 'Income not found' });

    res.json({ message: 'Income deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET INCOMES BY CATEGORY
============================= */
exports.getIncomesByCategory = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const categoryParam = req.params.category;
    if (!categoryParam)
      return res.status(400).json({ message: 'Category parameter required' });

    const categoryId = await resolveIncomeCategory(categoryParam, req.user._id);
    if (!categoryId) return res.json([]);

    const incomes = await Income.find({
      user: req.user._id,
      category: categoryId,
    })
      .populate('category', 'name color icon')
      .sort({ date: -1 });

    res.json(incomes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET INCOMES BY DATE RANGE
============================= */
exports.getIncomesByDateRange = async (req, res) => {
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

    const incomes = await Income.find({
      user: req.user._id,
      date: { $gte: start, $lte: end },
    })
      .populate('category', 'name color icon')
      .sort({ date: -1 });

    res.json(incomes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET INCOME STATS WITH DATE RANGE SUPPORT
============================= */
exports.getIncomeStats = async (req, res) => {
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

    const categoryStats = await Income.aggregate([
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
        const category = await IncomeCategory.findById(stat._id);
        return {
          name: category ? category.name : 'Unknown',
          totalAmount: stat.totalAmount,
          count: stat.count,
        };
      })
    );

    const totals = await Income.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalIncome: { $sum: '$amount' },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    const totalIncome = totals[0]?.totalIncome || 0;
    const totalTransactions = totals[0]?.totalTransactions || 0;
    const avgIncome = totalTransactions ? totalIncome / totalTransactions : 0;

    res.json({
      categoryStats: populatedStats,
      totalIncome,
      totalTransactions,
      avgIncome,
    });
  } catch (err) {
    console.error('Error getting income stats:', err);
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET INCOMES BY CATEGORY + DATE RANGE
============================= */
exports.getIncomesByCategoryAndDateRange = async (req, res) => {
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

    const categoryId = await resolveIncomeCategory(category, req.user._id);
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

    const incomes = await Income.find({
      user: req.user._id,
      category: categoryId,
      date: { $gte: start, $lte: end },
    })
      .populate('category', 'name color icon')
      .sort({ date: -1 });

    res.json(incomes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};