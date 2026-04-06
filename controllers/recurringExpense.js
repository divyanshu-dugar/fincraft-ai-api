const RecurringExpense = require('../models/RecurringExpense');
const Expense = require('../models/Expense');
const mongoose = require('mongoose');

/* ─── helpers ─────────────────────────────────────────────────────────── */

/**
 * Advance a date by one frequency period.
 */
function nextDate(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':   d.setUTCDate(d.getUTCDate() + 1);       break;
    case 'weekly':  d.setUTCDate(d.getUTCDate() + 7);       break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1);     break;
    case 'yearly':  d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d;
}

/**
 * Generate all overdue expense entries for a single recurring rule.
 * Returns the number of entries created.
 */
async function generateDueEntries(rule) {
  const now = new Date();
  let created = 0;
  let due = new Date(rule.nextDueDate);

  while (due <= now) {
    // Respect optional endDate
    if (rule.endDate && due > new Date(rule.endDate)) break;

    const expense = new Expense({
      user: rule.user,
      category: rule.category,
      amount: rule.amount,
      note: rule.note,
      date: due,
    });
    await expense.save();

    rule.lastGeneratedDate = due;
    due = nextDate(due, rule.frequency);
    created++;
  }

  rule.nextDueDate = due;

  // If past endDate, deactivate
  if (rule.endDate && due > new Date(rule.endDate)) {
    rule.isActive = false;
  }

  await rule.save();
  return created;
}

/* ─── GET /recurring-expenses ─────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  try {
    const rules = await RecurringExpense.find({ user: req.user._id })
      .populate('category', 'name color icon parentCategory')
      .sort({ createdAt: -1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── POST /recurring-expenses ───────────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const { category, amount, note, frequency, startDate, endDate } = req.body;

    if (!category || !amount || !frequency || !startDate) {
      return res.status(400).json({ error: 'category, amount, frequency, and startDate are required.' });
    }

    const start = new Date(startDate);

    const rule = new RecurringExpense({
      user: req.user._id,
      category,
      amount: Number(amount),
      note: note || '',
      frequency,
      startDate: start,
      nextDueDate: start,
      endDate: endDate ? new Date(endDate) : null,
    });

    await rule.save();

    // Immediately generate any entries that are already due
    await generateDueEntries(rule);

    const populated = await RecurringExpense.findById(rule._id)
      .populate('category', 'name color icon parentCategory');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── PUT /recurring-expenses/:id ────────────────────────────────────── */
exports.update = async (req, res) => {
  try {
    const rule = await RecurringExpense.findOne({ _id: req.params.id, user: req.user._id });
    if (!rule) return res.status(404).json({ error: 'Not found' });

    const { category, amount, note, frequency, endDate, isActive } = req.body;

    if (category  !== undefined) rule.category  = category;
    if (amount    !== undefined) rule.amount     = Number(amount);
    if (note      !== undefined) rule.note       = note;
    if (frequency !== undefined) rule.frequency  = frequency;
    if (endDate   !== undefined) rule.endDate    = endDate ? new Date(endDate) : null;
    if (isActive  !== undefined) rule.isActive   = isActive;

    await rule.save();

    const populated = await RecurringExpense.findById(rule._id)
      .populate('category', 'name color icon parentCategory');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── DELETE /recurring-expenses/:id ────────────────────────────────── */
exports.remove = async (req, res) => {
  try {
    const rule = await RecurringExpense.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!rule) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── POST /recurring-expenses/process ──────────────────────────────── */
/**
 * Called by the frontend on load to materialise any overdue entries.
 * Processes all active rules for the authenticated user.
 */
exports.process = async (req, res) => {
  try {
    const now = new Date();
    const dueRules = await RecurringExpense.find({
      user: req.user._id,
      isActive: true,
      nextDueDate: { $lte: now },
    });

    let totalCreated = 0;
    for (const rule of dueRules) {
      totalCreated += await generateDueEntries(rule);
    }

    res.json({ processed: dueRules.length, created: totalCreated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
