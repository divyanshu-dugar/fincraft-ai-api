const generateEmbedding = require('../utils/generateEmbedding');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const mongoose = require('mongoose');

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

        const utcDate = new Date(Date.UTC(
          localDate.getFullYear(),
          localDate.getMonth(),
          localDate.getDate()
        ));

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