const generateEmbedding = require('../utils/generateEmbedding');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const mongoose = require('mongoose');
const { toUTCDate, dateRangeFilter } = require('../utils/dateHelpers');

/**
 * Helper: Resolve category input (either ObjectId string or category name)
 */
async function resolveCategory(categoryInput, userId) {
  console.log(`[resolveCategory] INPUT: categoryInput="${categoryInput}", userId="${userId}", userId type=${typeof userId}`);
  
  if (!categoryInput) {
    console.warn(`[resolveCategory] FAIL: categoryInput is null/undefined`);
    return null;
  }

  // Ensure userId is a valid ObjectId
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    console.error(`[resolveCategory] FAIL: userId is not a valid ObjectId: "${userId}"`);
    return null;
  }

  const userObjectId = (userId instanceof mongoose.Types.ObjectId)
    ? userId
    : new mongoose.Types.ObjectId(String(userId));
  console.log(`[resolveCategory] Converted userId to ObjectId: ${userObjectId}`);

  // If ObjectId-like, check existence (within user's categories ONLY)
  if (mongoose.Types.ObjectId.isValid(String(categoryInput))) {
    console.log(`[resolveCategory] Input looks like ObjectId, searching...`);
    const cat = await ExpenseCategory.findOne({
      _id: new mongoose.Types.ObjectId(String(categoryInput)),
      user: userObjectId,
    });
    if (cat) {
      console.log(`[resolveCategory] SUCCESS: Found ObjectId category: ${cat._id}`);
      return cat._id;
    }
    // If ObjectId doesn't belong to user, don't use it
    console.warn(`[resolveCategory] FAIL: ObjectId found but doesn't belong to this user`);
    return null;
  }

  // Otherwise, treat input as a name (case-insensitive)
  const name = String(categoryInput).trim().replace(/\s+/g, ' ');
  console.log(`[resolveCategory] Category name after trim: "${name}"`);
  
  if (!name) {
    console.warn(`[resolveCategory] FAIL: Category name is empty after trim`);
    return null;
  }

  // First, try to find existing category for THIS user only
  console.log(`[resolveCategory] Searching for existing category "${name}" for user ${userObjectId}...`);
  const existing = await ExpenseCategory.findOne({
    user: userObjectId,
    name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' },
  });

  if (existing) {
    console.log(`[resolveCategory] SUCCESS: Found existing category "${name}" for user ${userObjectId}: ${existing._id}`);
    return existing._id;
  }

  // If not found for this user, create new one
  console.log(`[resolveCategory] Category "${name}" not found for user ${userObjectId}. Creating new...`);
  try {
    const newCat = new ExpenseCategory({
      user: userObjectId,
      name,
      color: '#9CA3AF',
      icon: '💰',
    });
    console.log(`[resolveCategory] Calling save() for new category...`);
    await newCat.save();
    console.log(`[resolveCategory] SUCCESS: Created new category "${name}" for user ${userObjectId}: ${newCat._id}`);
    return newCat._id;
  } catch (error) {
    console.error(`[resolveCategory] ERROR creating category: code=${error.code}, message=${error.message}`);
    
    // Handle E11000 duplicate key error - race condition where another process created it
    if (error.code === 11000) {
      console.warn(`[resolveCategory] Duplicate key error detected. Retrying search for user ${userObjectId}...`);
      
      // Retry finding the category for THIS user (it was just created by concurrent request)
      const retryFind = await ExpenseCategory.findOne({
        user: userObjectId,
        name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' },
      });
      
      if (retryFind) {
        console.log(`[resolveCategory] SUCCESS: After retry, found category "${name}" for user ${userObjectId}: ${retryFind._id}`);
        return retryFind._id;
      }
      
      console.error(`[resolveCategory] FAIL: Could not find category "${name}" even after duplicate key error for user ${userObjectId}`);
      return null;
    }
    
    // If it's not a duplicate key error, rethrow
    console.error(`[resolveCategory] FAIL: Non-duplicate error, throwing...`);
    throw error;
  }
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
      query.date = dateRangeFilter(startDate, endDate);
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
    
    const utcDate = toUTCDate(date.split('T')[0]);
    
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
      updateObj.date = toUTCDate(date.split('T')[0]);
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
      user: req.user._id,
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

    const expenses = await Expense.find({
      user: req.user._id,
      date: dateRangeFilter(startDate, endDate),
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
      matchStage.date = dateRangeFilter(startDate, endDate);
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

    const expenses = await Expense.find({
      user: req.user._id,
      category: categoryId,
      date: dateRangeFilter(startDate, endDate),
    })
      .populate('category', 'name color icon')
      .sort({ date: -1 });

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET CATEGORY MONTH-ON-MONTH ANALYTICS
============================= */
exports.getCategoryMonthComparison = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const startMonthRaw = String(req.query.startMonth || '').trim();
    const endMonthRaw = String(req.query.endMonth || '').trim();
    const categoryIdsRaw = String(req.query.categoryIds || '').trim();

    const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!monthRegex.test(startMonthRaw) || !monthRegex.test(endMonthRaw)) {
      return res.status(400).json({
        error: 'startMonth and endMonth are required in YYYY-MM format',
      });
    }

    const [startYear, startMon] = startMonthRaw.split('-').map(Number);
    const [endYear, endMon] = endMonthRaw.split('-').map(Number);

    const startDate = new Date(Date.UTC(startYear, startMon - 1, 1));
    const endDate = new Date(Date.UTC(endYear, endMon, 0, 23, 59, 59, 999));

    if (startDate > endDate) {
      return res.status(400).json({ error: 'startMonth must be less than or equal to endMonth' });
    }

    const selectedCategoryIds = categoryIdsRaw
      ? categoryIdsRaw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
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

    const monthlyAggregates = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            category: '$category',
          },
          amount: { $sum: '$amount' },
        },
      },
      {
        $lookup: {
          from: 'expensecategories',
          localField: '_id.category',
          foreignField: '_id',
          as: 'categoryDoc',
        },
      },
      {
        $addFields: {
          categoryName: {
            $ifNull: [{ $arrayElemAt: ['$categoryDoc.name', 0] }, 'Uncategorized'],
          },
          categoryIcon: {
            $ifNull: [{ $arrayElemAt: ['$categoryDoc.icon', 0] }, '💰'],
          },
          categoryColor: {
            $ifNull: [{ $arrayElemAt: ['$categoryDoc.color', 0] }, '#9CA3AF'],
          },
          categoryIsParent: {
            $ifNull: [{ $arrayElemAt: ['$categoryDoc.isParent', 0] }, false],
          },
          categoryParentId: {
            $arrayElemAt: ['$categoryDoc.parentCategory', 0],
          },
        },
      },
      // look up the parent category (if this is a subcategory)
      {
        $lookup: {
          from: 'expensecategories',
          localField: 'categoryParentId',
          foreignField: '_id',
          as: 'parentDoc',
        },
      },
      {
        $addFields: {
          parentName: {
            $ifNull: [{ $arrayElemAt: ['$parentDoc.name', 0] }, null],
          },
          parentIcon: {
            $ifNull: [{ $arrayElemAt: ['$parentDoc.icon', 0] }, null],
          },
          parentColor: {
            $ifNull: [{ $arrayElemAt: ['$parentDoc.color', 0] }, null],
          },
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
          categoryIsParent: 1,
          parentName: 1,
          parentIcon: 1,
          parentColor: 1,
          amount: { $round: ['$amount', 2] },
        },
      },
      { $sort: { year: 1, month: 1, categoryName: 1 } },
    ]);

    const months = [];
    let cursor = new Date(Date.UTC(startYear, startMon - 1, 1));
    const last = new Date(Date.UTC(endYear, endMon - 1, 1));
    while (cursor <= last) {
      months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }

    const categoryMap = new Map();
    for (const row of monthlyAggregates) {
      const key = String(row.categoryId);
      if (!categoryMap.has(key)) {
        categoryMap.set(key, {
          categoryId: key,
          categoryName: row.categoryName,
          categoryIcon: row.categoryIcon || '💰',
          categoryColor: row.categoryColor || '#9CA3AF',
          categoryIsParent: row.categoryIsParent || false,
          parentName: row.parentName || null,
          parentIcon: row.parentIcon || null,
          parentColor: row.parentColor || null,
        });
      }
    }

    const categories = Array.from(categoryMap.values()).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName)
    );

    const valueMap = new Map();
    for (const row of monthlyAggregates) {
      const monthKey = `${row.year}-${String(row.month).padStart(2, '0')}`;
      valueMap.set(`${monthKey}__${String(row.categoryId)}`, Number(row.amount || 0));
    }

    const table = [];
    const anomalyRows = [];
    const chartGroupedBars = months.map((month) => ({ month }));
    const trendLines = [];

    for (const category of categories) {
      const categorySeries = [];

      for (const month of months) {
        const amount = Number(valueMap.get(`${month}__${category.categoryId}`) || 0);
        categorySeries.push({ month, amount });
      }

      const trendData = [];
      for (let i = 0; i < categorySeries.length; i += 1) {
        const current = categorySeries[i];
        const prev = i > 0 ? categorySeries[i - 1].amount : 0;

        const prevAmounts = categorySeries
          .slice(Math.max(0, i - 3), i)
          .map((item) => item.amount);
        const movingAverage = prevAmounts.length
          ? prevAmounts.reduce((sum, value) => sum + value, 0) / prevAmounts.length
          : current.amount;

        // first data point has no previous month — return null so UI renders "—"
        const changePct = i === 0
          ? null
          : prev > 0
            ? ((current.amount - prev) / prev) * 100
            : current.amount > 0
              ? 100
              : 0;

        const isSpike = prevAmounts.length >= 2
          ? current.amount > movingAverage * 1.5 && current.amount - movingAverage >= 100
          : false;

        const anomaly = {
          isSpike,
          severity: isSpike
            ? current.amount > movingAverage * 2
              ? 'high'
              : 'medium'
            : 'none',
          reason: isSpike
            ? `Amount is ${(current.amount / (movingAverage || 1)).toFixed(2)}x of trailing average`
            : '',
        };

        const row = {
          month: current.month,
          categoryId: category.categoryId,
          category: category.categoryName,
          categoryIcon: category.categoryIcon,
          categoryColor: category.categoryColor,
          parentName: category.parentName,
          parentIcon: category.parentIcon,
          amount: Number(current.amount.toFixed(2)),
          changePct: changePct === null ? null : Number(changePct.toFixed(2)),
          movingAverage: Number(movingAverage.toFixed(2)),
          anomaly,
        };

        table.push(row);
        trendData.push(row);
        if (anomaly.isSpike) anomalyRows.push(row);
      }

      trendLines.push({
        categoryId: category.categoryId,
        category: category.categoryName,
        data: trendData,
      });
    }

    for (const bar of chartGroupedBars) {
      for (const category of categories) {
        const amount = Number(valueMap.get(`${bar.month}__${category.categoryId}`) || 0);
        bar[category.categoryName] = Number(amount.toFixed(2));
      }
    }

    return res.json({
      range: {
        startMonth: startMonthRaw,
        endMonth: endMonthRaw,
      },
      categories,
      months,
      table,
      chart: {
        groupedBars: chartGroupedBars,
        trendLines,
      },
      anomalies: anomalyRows,
      summary: {
        totalRows: table.length,
        anomalyCount: anomalyRows.length,
      },
    });
  } catch (err) {
    console.error('Error getting category month comparison:', err);
    return res.status(500).json({ error: err.message });
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

    console.log(`[importExpenses] Started: ${expenses.length} expenses to process`);
    console.log(`[importExpenses] User ID: ${req.user._id}`);

    const importedExpenses = [];
    const errors = [];

    // PASS 1: Pre-create/resolve all unique categories first
    console.log(`[importExpenses] PASS 1: Pre-resolving all categories...`);
    console.log(`[importExpenses] User ID type: ${typeof req.user._id}, value: ${req.user._id}`);
    
    // Extract unique category names (normalized key -> display name)
    const uniqueCategories = new Map();
    expenses.forEach((exp) => {
      if (!exp.category) return;
      const raw = String(exp.category).trim().replace(/\s+/g, ' ');
      const normalized = raw.toLowerCase();
      if (!normalized) return;
      if (!uniqueCategories.has(normalized)) {
        uniqueCategories.set(normalized, raw);
      }
    });

    console.log(
      `[importExpenses] Found ${uniqueCategories.size} unique categories: ${Array.from(uniqueCategories.values()).join(', ')}`
    );

    // Create/resolve all categories upfront
    const categoryMap = {}; // Maps normalized category name -> categoryId
    for (const [normalizedKey, displayName] of uniqueCategories.entries()) {
      try {
        console.log(`[importExpenses] ======================================`);
        console.log(`[importExpenses] Pre-resolving category: "${displayName}" (key="${normalizedKey}")`);
        console.log(`[importExpenses] Calling resolveCategory("${displayName}", ${req.user._id})`);
        
        const categoryId = await resolveCategory(displayName, req.user._id);
        console.log(`[importExpenses] resolveCategory returned: ${categoryId}`);
        
        if (categoryId) {
          categoryMap[normalizedKey] = categoryId;
          console.log(`[importExpenses] ✓ Successfully resolved "${displayName}" to ${categoryId}`);
        } else {
          console.error(`[importExpenses] ✗ resolveCategory returned null for "${displayName}" (key="${normalizedKey}")`);
        }
        console.log(`[importExpenses] ======================================`);
      } catch (err) {
        console.error(`[importExpenses] ERROR resolving category "${displayName}":`, err.message, err.stack);
      }
    }

    console.log(`[importExpenses] PASS 1 complete. Category map keys: ${Object.keys(categoryMap).join(', ')}`, categoryMap);

    // PASS 2: Create expenses using pre-resolved categories
    console.log(`[importExpenses] PASS 2: Creating expenses...`);

    for (const [index, expenseData] of expenses.entries()) {
      try {
        const { date, category, amount, note } = expenseData;

        console.log(`[importExpenses] Row ${index + 1}: Processing expense - category="${category}", amount=${amount}, date=${date}`);

        // Validate required fields
        if (!date || amount == null) {
          const error = `Row ${index + 1}: Date and amount are required`;
          errors.push(error);
          console.warn(`[importExpenses] ${error}`, { date, amount });
          continue;
        }

        if (isNaN(Number(amount))) {
          const error = `Row ${index + 1}: Amount must be a number (got: "${amount}")`;
          errors.push(error);
          console.warn(`[importExpenses] ${error}`);
          continue;
        }

        // Get pre-resolved category ID
        const categoryKeyRaw = String(category).trim().replace(/\s+/g, ' ');
        const categoryKey = categoryKeyRaw.toLowerCase();
        const categoryId = categoryMap[categoryKey];

        if (!categoryId) {
          const error = `Row ${index + 1}: Category "${categoryKey}" could not be resolved (not in map: ${Object.keys(categoryMap).join(', ')})`;
          errors.push(error);
          console.error(`[importExpenses] ${error}`);
          continue;
        }

        console.log(`[importExpenses] Row ${index + 1}: Using categoryId=${categoryId}`);

        // Convert date to UTC
        const localDate = new Date(date);
        if (isNaN(localDate.getTime())) {
          const error = `Row ${index + 1}: Invalid date format (got: "${date}")`;
          errors.push(error);
          console.warn(`[importExpenses] ${error}`);
          continue;
        }

        const utcDate = toUTCDate(date.split('T')[0]);

        // Generate semantic text for embedding (same as manual add)
        const semanticText = `Expense of ${amount} for ${categoryKeyRaw} on ${date}. Description: ${note || 'None'}`;
        const embeddingArray = await generateEmbedding(semanticText);

        const expense = new Expense({
          user: req.user._id,
          date: utcDate,
          category: categoryId,
          amount: Number(amount),
          note: note || '',
          embedding: embeddingArray
        });

        await expense.save();
        await expense.populate('category', 'name color icon');
        importedExpenses.push(expense);
        console.log(`[importExpenses] ✓ Row ${index + 1} imported: ${amount} - ${categoryKeyRaw}`);
      } catch (error) {
        const errorMsg = `Row ${index + 1}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`[importExpenses] ✗ Error importing row ${index + 1}:`, error);
      }
    }

    console.log(`[importExpenses] PASS 2 complete: ${importedExpenses.length}/${expenses.length} successfully imported`);
    
    if (errors.length > 0) {
      console.warn(`[importExpenses] Import errors: ${errors.length}`, errors);
    }

    res.json({
      message: `Successfully imported ${importedExpenses.length} expenses`,
      importedCount: importedExpenses.length,
      errors: errors,
      expenses: importedExpenses
    });

  } catch (err) {
    console.error('[importExpenses] Fatal error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   EXTRACT EXPENSES FROM IMAGE (AI-POWERED)
============================= */
exports.extractFromImage = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Prepare FormData for Python service
    const axios = require('axios');
    const FormData = require('form-data');
    const fs = require('fs');
    
    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    // Call Python LLM service to extract expenses from image
    const pythonServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    const response = await axios.post(`${pythonServiceUrl}/api/expenses/extract-image`, formData, {
      headers: formData.getHeaders(),
      timeout: 30000 // 30 second timeout for vision processing
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (!response.data || !response.data.expenses) {
      return res.status(500).json({ message: 'Failed to extract expenses from image' });
    }

    res.json({
      message: `Successfully extracted ${response.data.expenses.length} transaction${response.data.expenses.length !== 1 ? 's' : ''} from image`,
      expenses: response.data.expenses,
      count: response.data.expenses.length
    });

  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error deleting temp file:', e);
      }
    }

    console.error('Error extracting expenses from image:', error);
    
    if (error.response?.status === 400) {
      return res.status(400).json({ 
        message: error.response.data.message || 'Invalid image format' 
      });
    }
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        message: 'AI service temporarily unavailable. Please try again later.' 
      });
    }

    res.status(500).json({ 
      error: error.message || 'Failed to process image' 
    });
  }
};

/* =============================
   BULK DELETE EXPENSES
============================= */
exports.bulkDeleteExpenses = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }

    // Validate all IDs are valid ObjectIds
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid expense IDs provided' });
    }

    const result = await Expense.deleteMany({
      _id: { $in: validIds },
      user: req.user._id,
    });

    res.json({
      message: `${result.deletedCount} expense(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   BULK RECATEGORIZE EXPENSES
============================= */
exports.bulkRecategorize = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ids, categoryId } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ error: 'Valid categoryId is required' });
    }

    // Verify the category belongs to the user
    const category = await ExpenseCategory.findOne({
      _id: categoryId,
      user: req.user._id,
    });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    const result = await Expense.updateMany(
      { _id: { $in: validIds }, user: req.user._id },
      { $set: { category: categoryId } }
    );

    res.json({
      message: `${result.modifiedCount} expense(s) recategorized`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   BULK EDIT DATES
============================= */
exports.bulkEditDate = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ids, date } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const utcDate = toUTCDate(date);
    if (!utcDate || isNaN(utcDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    const result = await Expense.updateMany(
      { _id: { $in: validIds }, user: req.user._id },
      { $set: { date: utcDate } }
    );

    res.json({
      message: `${result.modifiedCount} expense(s) updated`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};