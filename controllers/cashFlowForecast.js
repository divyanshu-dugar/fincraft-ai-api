const Expense = require('../models/Expense');
const Income = require('../models/Income');
const RecurringExpense = require('../models/RecurringExpense');
const RecurringIncome = require('../models/RecurringIncome');
const Budget = require('../models/Budget');
const SavingsGoal = require('../models/SavingsGoalList');

// Minimum months of data required for reliable forecasting
const MIN_MONTHS_FOR_FORECAST = 2;
const IDEAL_MONTHS_FOR_FORECAST = 3;

/**
 * Advance a date by one frequency step.
 */
function nextDate(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':   d.setUTCDate(d.getUTCDate() + 1); break;
    case 'weekly':  d.setUTCDate(d.getUTCDate() + 7); break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'yearly':  d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d;
}

/**
 * Get all occurrences of a recurring item within a date range.
 */
function projectRecurring(rule, rangeStart, rangeEnd) {
  const entries = [];
  if (!rule.isActive) return entries;

  let cursor = new Date(rule.nextDueDate);
  const end = rule.endDate ? new Date(Math.min(rule.endDate, rangeEnd)) : rangeEnd;

  // Safety: cap at 400 iterations to prevent infinite loops
  let iterations = 0;
  while (cursor <= end && iterations < 400) {
    if (cursor >= rangeStart) {
      entries.push({ date: new Date(cursor), amount: rule.amount, category: rule.category });
    }
    cursor = nextDate(cursor, rule.frequency);
    iterations++;
  }
  return entries;
}

/**
 * Group transactions by YYYY-MM key.
 */
function groupByMonth(items) {
  const map = {};
  for (const item of items) {
    const d = new Date(item.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

/**
 * Count distinct months in a collection of records.
 */
function countDistinctMonths(records) {
  const months = new Set();
  for (const r of records) {
    const d = new Date(r.date);
    months.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months.size;
}

/**
 * Compute a weighted moving average for monthly totals.
 * Recent months get higher weight (linear weighting).
 */
function weightedMonthlyAverage(monthlyTotals) {
  if (monthlyTotals.length === 0) return 0;
  if (monthlyTotals.length === 1) return monthlyTotals[0];

  // monthlyTotals should be sorted oldest → newest
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < monthlyTotals.length; i++) {
    const weight = i + 1; // older months get lower weight
    weightedSum += monthlyTotals[i] * weight;
    weightTotal += weight;
  }
  return weightedSum / weightTotal;
}

/**
 * Calculate confidence score (0-100) based on data quality.
 */
function calculateConfidence(distinctExpenseMonths, distinctIncomeMonths, recurringExpenseCount, recurringIncomeCount) {
  const dataMonths = Math.max(distinctExpenseMonths, distinctIncomeMonths);

  // Base: months of data (0-50 points)
  let score = Math.min(dataMonths * 12.5, 50);

  // Recurring rules add reliability (0-25 points)
  const recurringCount = recurringExpenseCount + recurringIncomeCount;
  score += Math.min(recurringCount * 5, 25);

  // Both income AND expense data (0-25 points)
  if (distinctExpenseMonths >= 1 && distinctIncomeMonths >= 1) score += 10;
  if (distinctExpenseMonths >= 2 && distinctIncomeMonths >= 2) score += 15;

  return Math.min(Math.round(score), 100);
}

/* =============================
   GET CASH FLOW FORECAST
============================= */
exports.getForecast = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user._id;
    const forecastMonths = Math.min(Math.max(parseInt(req.query.months) || 3, 1), 12);

    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const currentDay = now.getUTCDate();

    // Look back 6 months for historical data
    const lookbackStart = new Date(Date.UTC(currentYear, currentMonth - 6, 1));

    // Current month boundaries
    const currentMonthStart = new Date(Date.UTC(currentYear, currentMonth, 1));
    const currentMonthEnd = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59, 999));
    const daysInCurrentMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
    const daysPassed = currentDay;
    const daysRemaining = daysInCurrentMonth - daysPassed;

    // Forecast range: from tomorrow to N months ahead
    const forecastStart = new Date(Date.UTC(currentYear, currentMonth, currentDay + 1));
    const forecastEnd = new Date(Date.UTC(currentYear, currentMonth + forecastMonths + 1, 0, 23, 59, 59, 999));

    // Fetch all data in parallel
    const [
      historicalExpenses,
      historicalIncome,
      recurringExpenses,
      recurringIncomes,
      activeBudgets,
      savingsGoals,
      currentMonthExpenses,
      currentMonthIncome,
    ] = await Promise.all([
      Expense.find({ user: userId, date: { $gte: lookbackStart, $lt: currentMonthStart } })
        .populate('category', 'name color icon').lean(),
      Income.find({ user: userId, date: { $gte: lookbackStart, $lt: currentMonthStart } })
        .populate('category', 'name color icon').lean(),
      RecurringExpense.find({ user: userId, isActive: true })
        .populate('category', 'name color icon').lean(),
      RecurringIncome.find({ user: userId, isActive: true })
        .populate('category', 'name color icon').lean(),
      Budget.find({ user: userId, isActive: true, endDate: { $gte: now } })
        .populate('category', 'name color icon').lean(),
      SavingsGoal.find({ user: userId, deadline: { $gte: now } }).lean(),
      Expense.find({ user: userId, date: { $gte: currentMonthStart, $lte: currentMonthEnd } })
        .populate('category', 'name color icon').lean(),
      Income.find({ user: userId, date: { $gte: currentMonthStart, $lte: currentMonthEnd } })
        .populate('category', 'name color icon').lean(),
    ]);

    // --- Data sufficiency check ---
    const distinctExpenseMonths = countDistinctMonths(historicalExpenses);
    const distinctIncomeMonths = countDistinctMonths(historicalIncome);
    const totalDistinctMonths = Math.max(distinctExpenseMonths, distinctIncomeMonths);
    const confidence = calculateConfidence(
      distinctExpenseMonths, distinctIncomeMonths,
      recurringExpenses.length, recurringIncomes.length
    );

    const hasSufficientData = totalDistinctMonths >= MIN_MONTHS_FOR_FORECAST ||
      (recurringExpenses.length + recurringIncomes.length) >= 2;

    if (!hasSufficientData) {
      return res.json({
        hasSufficientData: false,
        confidence,
        dataQuality: {
          distinctExpenseMonths,
          distinctIncomeMonths,
          recurringExpenseRules: recurringExpenses.length,
          recurringIncomeRules: recurringIncomes.length,
          minimumMonthsRequired: MIN_MONTHS_FOR_FORECAST,
          idealMonthsRequired: IDEAL_MONTHS_FOR_FORECAST,
          totalHistoricalExpenses: historicalExpenses.length,
          totalHistoricalIncome: historicalIncome.length,
        },
        message: `We need at least ${MIN_MONTHS_FOR_FORECAST} months of transaction history to generate a reliable forecast. You currently have ${totalDistinctMonths} month(s) of data. Keep tracking your finances and we'll unlock forecasting soon!`,
      });
    }

    // --- Historical analysis ---
    const expensesByMonth = groupByMonth(historicalExpenses);
    const incomeByMonth = groupByMonth(historicalIncome);

    // Monthly totals sorted oldest → newest
    const sortedMonthKeys = [...new Set([
      ...Object.keys(expensesByMonth),
      ...Object.keys(incomeByMonth),
    ])].sort();

    const monthlyExpenseTotals = sortedMonthKeys.map(
      (k) => (expensesByMonth[k] || []).reduce((s, e) => s + e.amount, 0)
    );
    const monthlyIncomeTotals = sortedMonthKeys.map(
      (k) => (incomeByMonth[k] || []).reduce((s, i) => s + i.amount, 0)
    );

    const avgMonthlyExpense = weightedMonthlyAverage(monthlyExpenseTotals);
    const avgMonthlyIncome = weightedMonthlyAverage(monthlyIncomeTotals);

    // Category-level expense trends (for budget risk detection)
    const categoryExpenseMap = {};
    for (const exp of historicalExpenses) {
      const catName = exp.category?.name || 'Uncategorized';
      const catId = exp.category?._id?.toString() || 'uncategorized';
      if (!categoryExpenseMap[catId]) {
        categoryExpenseMap[catId] = { name: catName, color: exp.category?.color, icon: exp.category?.icon, monthlyTotals: {} };
      }
      const d = new Date(exp.date);
      const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      categoryExpenseMap[catId].monthlyTotals[mk] = (categoryExpenseMap[catId].monthlyTotals[mk] || 0) + exp.amount;
    }

    // Category averages
    const categoryForecasts = {};
    for (const [catId, data] of Object.entries(categoryExpenseMap)) {
      const totals = sortedMonthKeys.map((k) => data.monthlyTotals[k] || 0).filter((t) => t > 0);
      categoryForecasts[catId] = {
        name: data.name,
        color: data.color,
        icon: data.icon,
        avgMonthly: totals.length > 0 ? weightedMonthlyAverage(totals) : 0,
      };
    }

    // --- Current month pace analysis ---
    const currentMonthExpenseTotal = currentMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const currentMonthIncomeTotal = currentMonthIncome.reduce((s, i) => s + i.amount, 0);
    const dailyExpenseRate = daysPassed > 0 ? currentMonthExpenseTotal / daysPassed : 0;
    const dailyIncomeRate = daysPassed > 0 ? currentMonthIncomeTotal / daysPassed : 0;
    const projectedMonthExpense = currentMonthExpenseTotal + (dailyExpenseRate * daysRemaining);
    const projectedMonthIncome = currentMonthIncomeTotal + (dailyIncomeRate * daysRemaining);

    // --- Project recurring items forward ---
    const projectedRecurringExpenses = [];
    const projectedRecurringIncome = [];
    for (const rule of recurringExpenses) {
      projectedRecurringExpenses.push(...projectRecurring(rule, forecastStart, forecastEnd));
    }
    for (const rule of recurringIncomes) {
      projectedRecurringIncome.push(...projectRecurring(rule, forecastStart, forecastEnd));
    }

    // Build month-by-month forecast
    const forecastByMonth = [];
    for (let i = 0; i <= forecastMonths; i++) {
      const mDate = new Date(Date.UTC(currentYear, currentMonth + i, 1));
      const mKey = `${mDate.getUTCFullYear()}-${String(mDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const mEnd = new Date(Date.UTC(mDate.getUTCFullYear(), mDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));

      let expenseAmount, incomeAmount;
      const isCurrentMonth = i === 0;

      if (isCurrentMonth) {
        // Current month: actual so far + projected remaining from recurring + daily rate
        const recurringExpRemaining = projectedRecurringExpenses
          .filter((e) => e.date >= forecastStart && e.date <= mEnd)
          .reduce((s, e) => s + e.amount, 0);
        const recurringIncRemaining = projectedRecurringIncome
          .filter((e) => e.date >= forecastStart && e.date <= mEnd)
          .reduce((s, e) => s + e.amount, 0);

        // Use the higher of: daily-rate projection or historical average
        // to avoid underestimating
        const expenseProjection = Math.max(projectedMonthExpense, avgMonthlyExpense * 0.8);
        const incomeProjection = Math.max(projectedMonthIncome, avgMonthlyIncome * 0.8);

        expenseAmount = Math.max(currentMonthExpenseTotal + recurringExpRemaining, expenseProjection);
        incomeAmount = Math.max(currentMonthIncomeTotal + recurringIncRemaining, incomeProjection);
      } else {
        // Future months: recurring + historical trend blend
        const recurringExp = projectedRecurringExpenses
          .filter((e) => {
            const eKey = `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, '0')}`;
            return eKey === mKey;
          })
          .reduce((s, e) => s + e.amount, 0);
        const recurringInc = projectedRecurringIncome
          .filter((e) => {
            const eKey = `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, '0')}`;
            return eKey === mKey;
          })
          .reduce((s, e) => s + e.amount, 0);

        // Blend: recurring known amounts + historical average for non-recurring
        const nonRecurringExpenseEstimate = Math.max(avgMonthlyExpense - recurringExp, 0);
        const nonRecurringIncomeEstimate = Math.max(avgMonthlyIncome - recurringInc, 0);

        expenseAmount = recurringExp + nonRecurringExpenseEstimate;
        incomeAmount = recurringInc + nonRecurringIncomeEstimate;
      }

      forecastByMonth.push({
        month: mKey,
        projectedExpense: Math.round(expenseAmount * 100) / 100,
        projectedIncome: Math.round(incomeAmount * 100) / 100,
        projectedNet: Math.round((incomeAmount - expenseAmount) * 100) / 100,
        isCurrentMonth,
        ...(isCurrentMonth ? {
          actualExpense: Math.round(currentMonthExpenseTotal * 100) / 100,
          actualIncome: Math.round(currentMonthIncomeTotal * 100) / 100,
          daysPassed,
          daysRemaining,
          daysInMonth: daysInCurrentMonth,
        } : {}),
      });
    }

    // --- Budget risk detection ---
    const budgetRisks = [];
    for (const budget of activeBudgets) {
      // Skip fixed expense budgets (e.g. rent, mortgage) — alerts are not useful for these
      if (budget.isFixedExpense) continue;

      const catId = budget.category?._id?.toString();
      const catName = budget.category?.name || 'Unknown';

      // Current month spending for this budget's category
      const currentCatSpending = currentMonthExpenses
        .filter((e) => e.category?._id?.toString() === catId)
        .reduce((s, e) => s + e.amount, 0);

      // Projected spending pace for this category
      const dailyCatRate = daysPassed > 0 ? currentCatSpending / daysPassed : 0;
      const projectedCatSpending = currentCatSpending + (dailyCatRate * daysRemaining);

      // Historical average for this category
      const historicalAvg = categoryForecasts[catId]?.avgMonthly || 0;

      // Previous month's spending for this category
      const prevMonthKey = sortedMonthKeys[sortedMonthKeys.length - 1];
      const prevCatSpending = prevMonthKey
        ? (categoryExpenseMap[catId]?.monthlyTotals[prevMonthKey] || 0)
        : 0;

      const budgetAmount = budget.amount;
      const percentUsed = budgetAmount > 0 ? (currentCatSpending / budgetAmount) * 100 : 0;
      const projectedPercent = budgetAmount > 0 ? (projectedCatSpending / budgetAmount) * 100 : 0;

      if (projectedPercent > 80) {
        const riskLevel = projectedPercent > 100 ? 'high' : projectedPercent > 90 ? 'medium' : 'low';
        budgetRisks.push({
          budgetId: budget._id,
          budgetName: budget.name,
          categoryName: catName,
          budgetAmount,
          currentSpent: Math.round(currentCatSpending * 100) / 100,
          projectedSpent: Math.round(projectedCatSpending * 100) / 100,
          previousMonthSpent: Math.round(prevCatSpending * 100) / 100,
          percentUsed: Math.round(percentUsed),
          projectedPercent: Math.round(projectedPercent),
          riskLevel,
          daysRemaining,
          historicalAvg: Math.round(historicalAvg * 100) / 100,
        });
      }
    }

    // --- Savings goal risk detection ---
    const goalRisks = [];
    const projectedMonthlySavings = avgMonthlyIncome - avgMonthlyExpense;
    for (const goal of savingsGoals) {
      const remaining = goal.amount - (goal.savedAmount || 0);
      if (remaining <= 0) continue;

      const deadline = new Date(goal.deadline);
      const monthsLeft = Math.max(
        (deadline.getUTCFullYear() - currentYear) * 12 + (deadline.getUTCMonth() - currentMonth),
        1
      );
      const requiredMonthly = remaining / monthsLeft;

      if (projectedMonthlySavings < requiredMonthly) {
        goalRisks.push({
          goalId: goal._id,
          goalName: goal.name,
          targetAmount: goal.amount,
          savedAmount: goal.savedAmount || 0,
          remaining: Math.round(remaining * 100) / 100,
          deadline: goal.deadline,
          monthsLeft,
          requiredMonthlySavings: Math.round(requiredMonthly * 100) / 100,
          projectedMonthlySavings: Math.round(projectedMonthlySavings * 100) / 100,
          shortfall: Math.round((requiredMonthly - projectedMonthlySavings) * 100) / 100,
          onTrack: false,
        });
      }
    }

    // --- Build smart insights ---
    const insights = [];

    // Pace comparison: current month vs previous months
    if (daysPassed >= 5 && prevMonthAvgExpense(sortedMonthKeys, expensesByMonth) > 0) {
      const prevAvg = prevMonthAvgExpense(sortedMonthKeys, expensesByMonth);
      const paceRatio = dailyExpenseRate / (prevAvg / 30);

      if (paceRatio > 1.2) {
        const overBy = Math.round((paceRatio - 1) * 100);
        insights.push({
          type: 'warning',
          key: 'spending_pace',
          title: 'Spending pace is elevated',
          message: `You're spending ${overBy}% faster than your recent average. At this rate, you'll spend ${formatAmount(projectedMonthExpense)} this month vs your average of ${formatAmount(prevAvg)}.`,
        });
      } else if (paceRatio < 0.8) {
        insights.push({
          type: 'positive',
          key: 'spending_pace',
          title: 'Great spending discipline',
          message: `Your spending pace is ${Math.round((1 - paceRatio) * 100)}% below your recent average. Keep it up!`,
        });
      }
    }

    // Net cash flow trend
    if (forecastByMonth.length > 1) {
      const futureNets = forecastByMonth.filter((m) => !m.isCurrentMonth).map((m) => m.projectedNet);
      const avgFutureNet = futureNets.reduce((s, n) => s + n, 0) / futureNets.length;

      if (avgFutureNet < 0) {
        insights.push({
          type: 'warning',
          key: 'negative_forecast',
          title: 'Negative cash flow projected',
          message: `Your forecast shows an average monthly deficit of ${formatAmount(Math.abs(avgFutureNet))}. Consider reviewing expenses or finding additional income.`,
        });
      } else if (avgFutureNet > avgMonthlyIncome * 0.2) {
        insights.push({
          type: 'positive',
          key: 'strong_savings_forecast',
          title: 'Strong savings trajectory',
          message: `You're on track to save ${formatAmount(avgFutureNet)} per month — that's ${Math.round((avgFutureNet / avgMonthlyIncome) * 100)}% of your income.`,
        });
      }
    }

    // Budget-specific insights
    for (const risk of budgetRisks) {
      if (risk.riskLevel === 'high') {
        insights.push({
          type: 'alert',
          key: `budget_risk_${risk.budgetId}`,
          title: `${risk.categoryName} budget at risk`,
          message: `You've spent ${formatAmount(risk.currentSpent)} of your ${formatAmount(risk.budgetAmount)} ${risk.categoryName} budget with ${risk.daysRemaining} days left. At current pace, you'll hit ${formatAmount(risk.projectedSpent)}.${
            risk.previousMonthSpent > 0
              ? ` Last month you spent ${formatAmount(risk.previousMonthSpent)} total.`
              : ''
          }`,
        });
      }
    }

    return res.json({
      hasSufficientData: true,
      confidence,
      dataQuality: {
        distinctExpenseMonths,
        distinctIncomeMonths,
        recurringExpenseRules: recurringExpenses.length,
        recurringIncomeRules: recurringIncomes.length,
        totalHistoricalExpenses: historicalExpenses.length,
        totalHistoricalIncome: historicalIncome.length,
      },
      summary: {
        avgMonthlyExpense: Math.round(avgMonthlyExpense * 100) / 100,
        avgMonthlyIncome: Math.round(avgMonthlyIncome * 100) / 100,
        avgMonthlyNet: Math.round((avgMonthlyIncome - avgMonthlyExpense) * 100) / 100,
        currentMonth: {
          actualExpense: Math.round(currentMonthExpenseTotal * 100) / 100,
          actualIncome: Math.round(currentMonthIncomeTotal * 100) / 100,
          projectedExpense: Math.round(projectedMonthExpense * 100) / 100,
          projectedIncome: Math.round(projectedMonthIncome * 100) / 100,
          projectedNet: Math.round((projectedMonthIncome - projectedMonthExpense) * 100) / 100,
          daysPassed,
          daysRemaining,
          daysInMonth: daysInCurrentMonth,
        },
      },
      forecast: forecastByMonth,
      budgetRisks: budgetRisks.sort((a, b) => b.projectedPercent - a.projectedPercent),
      goalRisks,
      insights,
      categoryForecasts: Object.values(categoryForecasts)
        .sort((a, b) => b.avgMonthly - a.avgMonthly)
        .slice(0, 10),
    });
  } catch (err) {
    console.error('[CashFlowForecast] Error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get the average expense for the most recent complete months.
 */
function prevMonthAvgExpense(sortedKeys, expensesByMonth) {
  if (sortedKeys.length === 0) return 0;
  const recentKeys = sortedKeys.slice(-3);
  const totals = recentKeys.map((k) => (expensesByMonth[k] || []).reduce((s, e) => s + e.amount, 0));
  return totals.reduce((s, t) => s + t, 0) / totals.length;
}

function formatAmount(amount) {
  return `$${Math.round(amount).toLocaleString()}`;
}
