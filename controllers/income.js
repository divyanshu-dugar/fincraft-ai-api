const Income = require('../models/Income');
const IncomeCategory = require('../models/IncomeCategory');
const mongoose = require('mongoose');
const generateEmbedding = require('../utils/generateEmbedding');
const { toUTCDate, dateRangeFilter } = require('../utils/dateHelpers');

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
      query.date = dateRangeFilter(startDate, endDate);
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

    const utcDate = toUTCDate(date.split('T')[0]);

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
      updateObj.date = toUTCDate(date.split('T')[0]);
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

    const incomes = await Income.find({
      user: req.user._id,
      date: dateRangeFilter(startDate, endDate),
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
      matchStage.date = dateRangeFilter(startDate, endDate);
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

    const incomes = await Income.find({
      user: req.user._id,
      category: categoryId,
      date: dateRangeFilter(startDate, endDate),
    })
      .populate('category', 'name color icon')
      .sort({ date: -1 });

    res.json(incomes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET INCOME CATEGORY MONTH-ON-MONTH ANALYTICS
============================= */
exports.getIncomeCategoryMonthComparison = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const startMonthRaw  = String(req.query.startMonth  || '').trim();
    const endMonthRaw    = String(req.query.endMonth    || '').trim();
    const categoryIdsRaw = String(req.query.categoryIds || '').trim();

    const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!monthRegex.test(startMonthRaw) || !monthRegex.test(endMonthRaw)) {
      return res.status(400).json({ error: 'startMonth and endMonth are required in YYYY-MM format' });
    }

    const [startYear, startMon] = startMonthRaw.split('-').map(Number);
    const [endYear,   endMon  ] = endMonthRaw.split('-').map(Number);

    const startDate = new Date(Date.UTC(startYear, startMon - 1, 1));
    const endDate   = new Date(Date.UTC(endYear,   endMon,       0, 23, 59, 59, 999));

    if (startDate > endDate) {
      return res.status(400).json({ error: 'startMonth must be <= endMonth' });
    }

    const selectedCategoryIds = categoryIdsRaw
      ? categoryIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id))
      : [];

    const userObjectId = new mongoose.Types.ObjectId(req.user._id);

    const matchStage = {
      user: userObjectId,
      date: { $gte: startDate, $lte: endDate },
    };
    if (selectedCategoryIds.length > 0) {
      matchStage.category = { $in: selectedCategoryIds };
    }

    const monthlyAggregates = await Income.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' }, category: '$category' },
          amount: { $sum: '$amount' },
        },
      },
      {
        $lookup: {
          from: 'incomecategories',
          localField: '_id.category',
          foreignField: '_id',
          as: 'categoryDoc',
        },
      },
      {
        $addFields: {
          categoryName:  { $ifNull: [{ $arrayElemAt: ['$categoryDoc.name',  0] }, 'Uncategorized'] },
          categoryIcon:  { $ifNull: [{ $arrayElemAt: ['$categoryDoc.icon',  0] }, '💰'] },
          categoryColor: { $ifNull: [{ $arrayElemAt: ['$categoryDoc.color', 0] }, '#10B981'] },
        },
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          categoryId: '$_id.category',
          categoryName: 1,
          categoryIcon: 1,
          categoryColor: 1,
          amount: { $round: ['$amount', 2] },
        },
      },
      { $sort: { year: 1, month: 1, categoryName: 1 } },
    ]);

    // Build full month list
    const months = [];
    let cursor = new Date(Date.UTC(startYear, startMon - 1, 1));
    const last  = new Date(Date.UTC(endYear,  endMon - 1,   1));
    while (cursor <= last) {
      months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }

    // Category index
    const categoryMap = {};
    for (const row of monthlyAggregates) {
      const id = String(row.categoryId);
      if (!categoryMap[id]) {
        categoryMap[id] = {
          categoryId:    id,
          categoryName:  row.categoryName,
          categoryIcon:  row.categoryIcon,
          categoryColor: row.categoryColor,
        };
      }
    }
    const categories = Object.values(categoryMap);

    // Group by month key
    const byMonthKey = {};
    for (const row of monthlyAggregates) {
      const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
      if (!byMonthKey[key]) byMonthKey[key] = {};
      byMonthKey[key][String(row.categoryId)] = row.amount;
    }

    // Grouped bars for recharts
    const groupedBars = months.map((m) => {
      const entry = { month: m };
      for (const cat of categories) entry[cat.categoryName] = byMonthKey[m]?.[cat.categoryId] || 0;
      return entry;
    });

    // Trend lines
    const trendLines = categories.map((cat) => ({
      categoryId:    cat.categoryId,
      categoryName:  cat.categoryName,
      categoryColor: cat.categoryColor,
      data: months.map((m) => ({ month: m, amount: byMonthKey[m]?.[cat.categoryId] || 0 })),
    }));

    // Table rows with anomaly detection (spike = 50%+ above 3-month trailing avg)
    const tableRows = monthlyAggregates.map((row) => {
      const catId = String(row.categoryId);
      const trailingAmounts = [];
      let c2 = new Date(Date.UTC(row.year, row.month - 1, 1));
      for (let i = 0; i < 3; i++) {
        c2 = new Date(Date.UTC(c2.getUTCFullYear(), c2.getUTCMonth() - 1, 1));
        const k = `${c2.getUTCFullYear()}-${String(c2.getUTCMonth() + 1).padStart(2, '0')}`;
        if (byMonthKey[k]?.[catId] != null) trailingAmounts.push(byMonthKey[k][catId]);
      }
      const trailing3Avg = trailingAmounts.length
        ? trailingAmounts.reduce((a, b) => a + b, 0) / trailingAmounts.length
        : null;

      let anomaly = null;
      if (trailing3Avg !== null && trailing3Avg > 0) {
        const pctChange = ((row.amount - trailing3Avg) / trailing3Avg) * 100;
        if (pctChange >= 50) {
          anomaly = {
            pctChange: Math.round(pctChange),
            severity: pctChange >= 100 ? 'high' : 'medium',
            reason: `${Math.round(pctChange)}% above 3-month avg ($${trailing3Avg.toFixed(0)})`,
          };
        }
      }

      return {
        month:         `${row.year}-${String(row.month).padStart(2, '0')}`,
        category:      row.categoryName,
        categoryId:    catId,
        categoryIcon:  row.categoryIcon,
        categoryColor: row.categoryColor,
        amount:        row.amount,
        anomaly,
      };
    });

    const anomalies = tableRows.filter((r) => r.anomaly);

    res.json({
      months,
      categories,
      chart: { groupedBars, trendLines },
      table: tableRows,
      anomalies,
      summary: { totalRows: tableRows.length, anomalyCount: anomalies.length },
    });
  } catch (err) {
    console.error('Error getting income category analytics:', err);
    res.status(500).json({ error: err.message });
  }
};