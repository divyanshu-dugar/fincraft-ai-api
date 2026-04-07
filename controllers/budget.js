const Budget = require('../models/Budget');
const BudgetAlert = require('../models/BudgetAlert');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const User = require('../models/User');
const mongoose = require('mongoose');
const generateEmbedding = require('../utils/generateEmbedding');
const { sendBudgetAlertEmail } = require('../utils/email');

/* =============================
   GET ALL BUDGETS (user-specific) WITH OPTIONAL DATE RANGE FILTER
============================= */
exports.getBudgets = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Build query object
        let query = { user: req.user._id };

        // Check for date range query parameters
        const { startDate, endDate } = req.query;
        
        // If date range is provided, filter budgets that overlap with the date range
        if (startDate && endDate) {
            const queryStartDate = new Date(startDate);
            const queryEndDate = new Date(endDate);
            
            query.$and = [
                { startDate: { $lte: queryEndDate } },
                { endDate: { $gte: queryStartDate } }
            ];
        }

        const budgets = await Budget.find(query)
            .populate('category', 'name color icon')
            .sort({ createdAt: -1 });

        const budgetsWithSpending = await Promise.all(
            budgets.map(async (budget) => {
                // For budget spending calculation, consider query date range if provided
                let spendingStartDate = new Date(budget.startDate);
                let spendingEndDate = new Date(budget.endDate);
                
                if (startDate && endDate) {
                    spendingStartDate = new Date(Math.max(
                        new Date(budget.startDate).getTime(),
                        new Date(startDate).getTime()
                    ));
                    
                    spendingEndDate = new Date(Math.min(
                        new Date(budget.endDate).getTime(),
                        new Date(endDate).getTime()
                    ));
                }

                const expenses = await Expense.find({
                    user: budget.user,
                    category: budget.category,
                    date: {
                        $gte: spendingStartDate,
                        $lte: spendingEndDate
                    }
                });

                const currentSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
                
                // Calculate proportional budget
                const budgetTotalDays = (new Date(budget.endDate) - new Date(budget.startDate)) / (1000 * 60 * 60 * 24) + 1;
                const queryDays = (spendingEndDate - spendingStartDate) / (1000 * 60 * 60 * 24) + 1;
                const proportionalBudget = (budget.amount * queryDays) / budgetTotalDays;
                
                const percentage = proportionalBudget > 0 ? (currentSpent / proportionalBudget) * 100 : 0;
                const today = new Date();
                const budgetStartDate = new Date(budget.startDate);
                const budgetEndDate = new Date(budget.endDate);
                
                // Calculate budget status
                let status = 'on_track';
                if (percentage > 100) {
                    status = 'exceeded';
                } else if (percentage === 100) {
                    status = 'limit_reached';
                } else if (percentage >= budget.alertThreshold) {
                    status = 'almost_exceeded';
                }
                
                let dateStatus = 'current';
                if (today < budgetStartDate) {
                    dateStatus = 'upcoming';
                } else if (today > budgetEndDate) {
                    dateStatus = 'expired';
                }
                
                return {
                    ...budget.toObject(),
                    currentSpent,
                    percentage: Math.min(percentage, 100),
                    remaining: Math.max(proportionalBudget - currentSpent, 0),
                    status,
                    dateStatus,
                    proportionalBudget,
                    queryStartDate: spendingStartDate,
                    queryEndDate: spendingEndDate
                };
            })
        );
        
        res.json(budgetsWithSpending);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   GET BUDGET BY ID
============================= */
exports.getBudgetById = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const budget = await Budget.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).populate('category', 'name color icon');

        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        // Calculate current spending for this budget
        const currentSpent = await calculateBudgetSpending(budget);
        const percentage = (currentSpent / budget.amount) * 100;
        
        // Calculate budget status
        let status = 'on_track';
        if (percentage > 100) {
            status = 'exceeded';
        } else if (percentage === 100) {
            status = 'limit_reached';
        } else if (percentage >= budget.alertThreshold) {
            status = 'almost_exceeded';
        }

        res.json({
            ...budget.toObject(),
            currentSpent,
            percentage: Math.min(percentage, 100),
            remaining: Math.max(budget.amount - currentSpent, 0),
            status
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   ADD NEW BUDGET
============================= */
exports.addBudget = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { name, amount, period, category, startDate, endDate, notifications, alertThreshold, isRecurring, repeatUntil } = req.body;

        // Validation
        if (!name || !amount || !category || !startDate || !endDate) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (amount <= 0) {
            return res.status(400).json({ message: 'Amount must be positive' });
        }

        // Check if category exists and belongs to user
        const categoryExists = await ExpenseCategory.findOne({
            _id: category,
            user: req.user._id
        });

        if (!categoryExists) {
            return res.status(400).json({ message: 'Invalid category' });
        }

        // Check for overlapping budgets for same category
        const existingBudget = await Budget.findOne({
            user: req.user._id,
            category: category,
            isActive: true,
            $or: [
                { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
            ]
        });

        if (existingBudget) {
            return res.status(400).json({ 
                message: 'Budget already exists for this category in the selected time period' 
            });
        }

        const semanticText = `Budget "${name}" for ${amount} (${period}). Spans from ${startDate} to ${endDate}. Alerts at ${alertThreshold || 80}%.`;
        const embeddingArray = await generateEmbedding(semanticText);

        const budget = new Budget({
            user: req.user._id,
            name,
            amount,
            period,
            category,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            notifications: notifications !== undefined ? notifications : true,
            alertThreshold: alertThreshold || 80,
            embedding: embeddingArray,
            isRecurring: !!isRecurring,
            repeatUntil: repeatUntil ? new Date(repeatUntil) : null,
        });

        await budget.save();
        await budget.populate('category', 'name color icon');

        res.status(201).json({
            message: 'Budget created successfully',
            budget
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   UPDATE BUDGET
============================= */
exports.editBudget = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { name, amount, period, category, startDate, endDate, notifications, alertThreshold, isActive } = req.body;

        const updateObj = {};
        if (name) updateObj.name = name;
        if (amount) updateObj.amount = amount;
        if (period) updateObj.period = period;
        if (category) updateObj.category = category;
        if (startDate) updateObj.startDate = new Date(startDate);
        if (endDate) updateObj.endDate = new Date(endDate);
        if (notifications !== undefined) updateObj.notifications = notifications;
        if (alertThreshold) updateObj.alertThreshold = alertThreshold;
        if (isActive !== undefined) updateObj.isActive = isActive;

        const budget = await Budget.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            updateObj,
            { new: true }
        ).populate('category', 'name color icon');

        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        const semanticText = `Budget "${budget.name}" for ${budget.amount} (${budget.period}). Spans from ${budget.startDate} to ${budget.endDate}. Alerts at ${budget.alertThreshold}%.`;
        const embeddingArray = await generateEmbedding(semanticText);
        
        budget.embedding = embeddingArray;
        await budget.save();

        res.json({
            message: 'Budget updated successfully',
            budget
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   DELETE BUDGET
============================= */
exports.deleteBudget = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const budget = await Budget.findOne({
            _id: req.params.id,
            user: req.user._id,
        });

        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        // If cascade=true, recursively delete all future successors first
        if (req.query.cascade === 'true' && budget.isRecurring) {
            const deleteChain = async (parentId) => {
                const children = await Budget.find({ parentBudgetId: parentId, user: req.user._id });
                for (const child of children) {
                    await deleteChain(child._id);
                    await BudgetAlert.deleteMany({ budget: child._id });
                    await Budget.deleteOne({ _id: child._id });
                }
            };
            await deleteChain(budget._id);
        }

        await Budget.deleteOne({ _id: budget._id });
        await BudgetAlert.deleteMany({ budget: budget._id });

        res.json({ message: 'Budget deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   GET BUDGET STATS WITH DATE RANGE SUPPORT
============================= */
exports.getBudgetStats = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = new mongoose.Types.ObjectId(req.user._id);

        // Build query object
        let query = { 
            user: req.user._id, 
            isActive: true 
        };

        // Check for date range query parameters
        const { startDate, endDate } = req.query;
        
        // If date range is provided, filter budgets that overlap with the date range
        if (startDate && endDate) {
            const queryStartDate = new Date(startDate);
            const queryEndDate = new Date(endDate);
            
            // Find budgets that overlap with the query date range
            query.$and = [
                { startDate: { $lte: queryEndDate } },
                { endDate: { $gte: queryStartDate } }
            ];
        }

        // Get budgets with spending data
        const budgets = await Budget.find(query)
            .populate('category', 'name color icon');

        const budgetStats = await Promise.all(
            budgets.map(async (budget) => {
                // For budget spending calculation, we need to consider:
                // 1. If query date range is provided, calculate spending only within that range
                // 2. Otherwise, calculate spending within the budget's own date range
                
                let spendingStartDate = new Date(budget.startDate);
                let spendingEndDate = new Date(budget.endDate);
                
                if (startDate && endDate) {
                    // Use the later of budget start date and query start date
                    spendingStartDate = new Date(Math.max(
                        new Date(budget.startDate).getTime(),
                        new Date(startDate).getTime()
                    ));
                    
                    // Use the earlier of budget end date and query end date
                    spendingEndDate = new Date(Math.min(
                        new Date(budget.endDate).getTime(),
                        new Date(endDate).getTime()
                    ));
                }

                const currentSpent = await Expense.aggregate([
                    {
                        $match: {
                            user: userId,
                            category: budget.category._id,
                            date: {
                                $gte: spendingStartDate,
                                $lte: spendingEndDate
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: '$amount' }
                        }
                    }
                ]);

                const spentAmount = currentSpent.length > 0 ? currentSpent[0].total : 0;
                
                // Calculate the proportional budget amount for the date range
                const budgetTotalDays = (new Date(budget.endDate) - new Date(budget.startDate)) / (1000 * 60 * 60 * 24) + 1;
                const queryDays = (spendingEndDate - spendingStartDate) / (1000 * 60 * 60 * 24) + 1;
                const proportionalBudget = (budget.amount * queryDays) / budgetTotalDays;
                
                const percentage = proportionalBudget > 0 ? (spentAmount / proportionalBudget) * 100 : 0;
                const remaining = Math.max(proportionalBudget - spentAmount, 0);
                
                // Calculate budget status
                let status = 'on_track';
                if (percentage > 100) {
                    status = 'exceeded';
                } else if (percentage === 100) {
                    status = 'limit_reached';
                } else if (percentage >= budget.alertThreshold) {
                    status = 'almost_exceeded';
                }

                return {
                    ...budget.toObject(),
                    currentSpent: spentAmount,
                    percentage: Math.min(percentage, 100),
                    remaining,
                    status,
                    proportionalBudget,
                    queryStartDate: spendingStartDate,
                    queryEndDate: spendingEndDate
                };
            })
        );

        // Filter out budgets with zero proportional budget (outside date range)
        const validBudgets = budgetStats.filter(budget => budget.proportionalBudget > 0);

        // Overall stats
        const totalBudget = validBudgets.reduce((sum, budget) => sum + budget.proportionalBudget, 0);
        const totalSpent = validBudgets.reduce((sum, stat) => sum + stat.currentSpent, 0);
        const totalRemaining = Math.max(totalBudget - totalSpent, 0);
        const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
        
        // Count budgets by status
        const onTrackBudgets = validBudgets.filter(stat => stat.status === 'on_track').length;
        const almostExceededBudgets = validBudgets.filter(stat => stat.status === 'almost_exceeded').length;
        const limitReachedBudgets = validBudgets.filter(stat => stat.status === 'limit_reached').length;
        const exceededBudgets = validBudgets.filter(stat => stat.status === 'exceeded').length;

        res.json({
            budgetStats: validBudgets,
            overallStats: {
                totalBudget,
                totalSpent,
                totalRemaining,
                overallPercentage: Math.min(overallPercentage, 100),
                activeBudgets: validBudgets.length,
                onTrackBudgets,
                almostExceededBudgets,
                limitReachedBudgets,
                exceededBudgets
            }
        });
    } catch (err) {
        console.error('Error getting budget stats:', err);
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   CHECK BUDGET ALERTS
============================= */
exports.checkBudgetAlerts = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const budgets = await Budget.find({ 
            user: req.user._id, 
            isActive: true,
            notifications: true
        }).populate('category', 'name color icon');

        // Fetch user email once for notifications
        const user = await User.findById(req.user._id).select('email userName').lean();

        const newAlerts = [];

        for (const budget of budgets) {
            const currentSpent = await calculateBudgetSpending(budget);
            const percentage = (currentSpent / budget.amount) * 100;

            // Check if we need to create alerts
            if (percentage > 100) {
                // Budget exceeded (over 100%)
                const existingAlert = await BudgetAlert.findOne({
                    budget: budget._id,
                    type: 'budget_exceeded',
                    isRead: false
                });

                if (!existingAlert) {
                    const alert = new BudgetAlert({
                        user: req.user._id,
                        budget: budget._id,
                        type: 'budget_exceeded',
                        message: `Budget "${budget.name}" has been exceeded! Spent ${currentSpent} out of ${budget.amount}`,
                        currentSpent,
                        budgetAmount: budget.amount,
                        percentage
                    });
                    await alert.save();
                    newAlerts.push(alert);
                    // Send email — fire-and-forget so a mail failure never breaks the response
                    if (user?.email) {
                        sendBudgetAlertEmail(user.email, user.userName, {
                            budgetName: budget.name,
                            type: 'budget_exceeded',
                            percentage,
                            currentSpent,
                            budgetAmount: budget.amount,
                            category: budget.category?.name,
                        }).catch((err) => console.error('[BudgetAlert email error]', err.message));
                    }
                }
            } else if (percentage === 100) {
                // Budget limit reached (exactly 100%)
                const existingAlert = await BudgetAlert.findOne({
                    budget: budget._id,
                    type: 'budget_limit_reached',
                    isRead: false
                });

                if (!existingAlert) {
                    const alert = new BudgetAlert({
                        user: req.user._id,
                        budget: budget._id,
                        type: 'budget_limit_reached',
                        message: `Budget "${budget.name}" has reached its limit! Spent ${currentSpent} out of ${budget.amount}`,
                        currentSpent,
                        budgetAmount: budget.amount,
                        percentage
                    });
                    await alert.save();
                    newAlerts.push(alert);
                    if (user?.email) {
                        sendBudgetAlertEmail(user.email, user.userName, {
                            budgetName: budget.name,
                            type: 'budget_exceeded',
                            percentage,
                            currentSpent,
                            budgetAmount: budget.amount,
                            category: budget.category?.name,
                        }).catch((err) => console.error('[BudgetAlert email error]', err.message));
                    }
                }
            } else if (percentage >= budget.alertThreshold) {
                // Budget almost exceeded (80-99%)
                const existingAlert = await BudgetAlert.findOne({
                    budget: budget._id,
                    type: 'budget_almost_exceeded',
                    isRead: false
                });

                if (!existingAlert) {
                    const alert = new BudgetAlert({
                        user: req.user._id,
                        budget: budget._id,
                        type: 'budget_almost_exceeded',
                        message: `Budget "${budget.name}" is ${percentage.toFixed(1)}% used (${currentSpent}/${budget.amount})`,
                        currentSpent,
                        budgetAmount: budget.amount,
                        percentage
                    });
                    await alert.save();
                    newAlerts.push(alert);
                    if (user?.email) {
                        sendBudgetAlertEmail(user.email, user.userName, {
                            budgetName: budget.name,
                            type: 'budget_almost_exceeded',
                            percentage,
                            currentSpent,
                            budgetAmount: budget.amount,
                            category: budget.category?.name,
                        }).catch((err) => console.error('[BudgetAlert email error]', err.message));
                    }
                }
            }
        }

        res.json({
            message: 'Budget alerts checked',
            newAlerts: newAlerts.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   GET USER ALERTS
============================= */
exports.getUserAlerts = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const alerts = await BudgetAlert.find({ user: req.user._id })
            .populate('budget')
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   MARK ALERT AS READ
============================= */
exports.markAlertAsRead = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const alert = await BudgetAlert.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { isRead: true },
            { new: true }
        );

        if (!alert) {
            return res.status(404).json({ message: 'Alert not found' });
        }

        res.json({ message: 'Alert marked as read', alert });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   CLEAR ALERTS (hard delete)
   DELETE /budgets/alerts        → deletes all read alerts
   DELETE /budgets/alerts?all=1  → deletes ALL alerts (read + unread)
============================= */
exports.clearAlerts = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const deleteAll = req.query.all === '1';
        const filter = { user: req.user._id };
        if (!deleteAll) filter.isRead = true;

        const result = await BudgetAlert.deleteMany(filter);
        res.json({ message: 'Alerts cleared', deleted: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   HELPER: Calculate Budget Spending with Optional Date Range
============================= */
async function calculateBudgetSpending(budget, startDate = null, endDate = null) {
    const matchCriteria = {
        user: budget.user,
        category: budget.category
    };

    // Use provided date range or budget's date range
    if (startDate && endDate) {
        matchCriteria.date = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    } else {
        matchCriteria.date = {
            $gte: new Date(budget.startDate),
            $lte: new Date(budget.endDate)
        };
    }

    const expenses = await Expense.find(matchCriteria);
    return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

/* =============================
   HELPER: Calculate next period window
============================= */
function calcNextPeriod(period, endDate) {
    const end = new Date(endDate);
    let nextStart, nextEnd;

    if (period === 'weekly') {
        // Start the day after the current end
        nextStart = new Date(end);
        nextStart.setUTCDate(nextStart.getUTCDate() + 1);
        nextEnd = new Date(nextStart);
        nextEnd.setUTCDate(nextEnd.getUTCDate() + 6);
    } else if (period === 'monthly') {
        // First day of the next month
        const year  = end.getUTCFullYear();
        const month = end.getUTCMonth(); // 0-indexed; end is already last day of its month
        nextStart = new Date(Date.UTC(year, month + 1, 1));
        nextEnd   = new Date(Date.UTC(year, month + 2, 0)); // last day of that next month
    } else {
        // yearly
        const year = end.getUTCFullYear() + 1;
        nextStart  = new Date(Date.UTC(year, 0,  1));
        nextEnd    = new Date(Date.UTC(year, 11, 31));
    }

    return { nextStart, nextEnd };
}

/* =============================
   ROLLOVER RECURRING BUDGETS
============================= */
/* =============================
   ROLLOVER RECURRING BUDGETS TO A TARGET DATE
   POST /budgets/rollover-to  { targetYear, targetMonth }
   Creates budgets for each recurring chain up to the given month.
============================= */
exports.rolloverToTarget = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { targetYear, targetMonth } = req.body; // targetMonth is 0-indexed
        if (targetYear == null || targetMonth == null) {
            return res.status(400).json({ error: 'targetYear and targetMonth are required' });
        }

        // Last day of the target month
        const targetDate = new Date(Date.UTC(Number(targetYear), Number(targetMonth) + 1, 0));

        // Find ALL recurring budgets for this user (active or not — we need the chain heads)
        const allRecurring = await Budget.find({
            user: req.user._id,
            isRecurring: true,
        }).sort({ startDate: 1 });

        let created = 0;
        const SAFETY = 36; // max months to chain forward

        for (const baseBudget of allRecurring) {
            // Walk to the latest node in this budget's chain
            let current = baseBudget;
            let iterations = 0;

            while (current.endDate < targetDate && iterations < SAFETY) {
                iterations++;

                const { nextStart, nextEnd } = calcNextPeriod(current.period, current.endDate);

                // Stop if repeatUntil is set and next period starts after it
                if (current.repeatUntil && nextStart > new Date(current.repeatUntil)) break;

                // Check if a direct successor already exists
                const existing = await Budget.findOne({
                    user: req.user._id,
                    parentBudgetId: current._id,
                });

                if (existing) {
                    current = existing;
                    continue;
                }

                // Guard against overlap with any other budget in the same category
                const overlap = await Budget.findOne({
                    user: req.user._id,
                    category: current.category,
                    isActive: true,
                    startDate: { $lte: nextEnd },
                    endDate:   { $gte: nextStart },
                });

                if (overlap) break;

                const semanticText = `Budget "${current.name}" for ${current.amount} (${current.period}). Spans from ${nextStart.toISOString()} to ${nextEnd.toISOString()}. Alerts at ${current.alertThreshold}%.`;
                const embeddingArray = await generateEmbedding(semanticText);

                const newBudget = await Budget.create({
                    user:           req.user._id,
                    name:           current.name,
                    amount:         current.amount,
                    period:         current.period,
                    category:       current.category,
                    startDate:      nextStart,
                    endDate:        nextEnd,
                    notifications:  current.notifications,
                    alertThreshold: current.alertThreshold,
                    isRecurring:    true,
                    repeatUntil:    current.repeatUntil,
                    parentBudgetId: current._id,
                    embedding:      embeddingArray,
                });

                created++;
                current = newBudget;
            }
        }

        res.json({ message: 'Rollover to target complete', created });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* =============================
   ROLLOVER RECURRING BUDGETS
============================= */
exports.rolloverRecurringBudgets = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const now = new Date();

        // Find all recurring budgets that have ended
        const expiredRecurring = await Budget.find({
            user: req.user._id,
            isRecurring: true,
            isActive: true,
            endDate: { $lt: now },
        });

        let rolled = 0;

        for (const budget of expiredRecurring) {
            const { nextStart, nextEnd } = calcNextPeriod(budget.period, budget.endDate);

            // Stop if repeatUntil is set and the next period starts after it
            if (budget.repeatUntil && nextStart > new Date(budget.repeatUntil)) {
                continue;
            }

            // Check a successor doesn't already exist for this period
            const successor = await Budget.findOne({
                user: req.user._id,
                category: budget.category,
                parentBudgetId: budget._id,
                startDate: nextStart,
            });

            if (successor) continue;

            // Also guard against any overlapping budget for this category
            const overlap = await Budget.findOne({
                user: req.user._id,
                category: budget.category,
                isActive: true,
                startDate: { $lte: nextEnd },
                endDate:   { $gte: nextStart },
            });

            if (overlap) continue;

            const semanticText = `Budget "${budget.name}" for ${budget.amount} (${budget.period}). Spans from ${nextStart.toISOString()} to ${nextEnd.toISOString()}. Alerts at ${budget.alertThreshold}%.`;
            const embeddingArray = await generateEmbedding(semanticText);

            await Budget.create({
                user:            req.user._id,
                name:            budget.name,
                amount:          budget.amount,
                period:          budget.period,
                category:        budget.category,
                startDate:       nextStart,
                endDate:         nextEnd,
                notifications:   budget.notifications,
                alertThreshold:  budget.alertThreshold,
                isRecurring:     true,
                repeatUntil:     budget.repeatUntil,
                parentBudgetId:  budget._id,
                embedding:       embeddingArray,
            });

            rolled++;
        }

        res.json({ message: 'Rollover complete', rolled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};