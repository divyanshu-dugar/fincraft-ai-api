const RecurringIncome = require('../models/RecurringIncome');
const Income = require('../models/Income');

/* ─── helpers ─────────────────────────────────────────────────────────── */

function nextDate(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':   d.setUTCDate(d.getUTCDate() + 1);         break;
    case 'weekly':  d.setUTCDate(d.getUTCDate() + 7);         break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1);       break;
    case 'yearly':  d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d;
}

async function generateDueEntries(rule) {
  const now = new Date();
  let created = 0;
  let due = new Date(rule.nextDueDate);

  while (due <= now) {
    if (rule.endDate && due > new Date(rule.endDate)) break;

    const income = new Income({
      user: rule.user,
      category: rule.category,
      amount: rule.amount,
      note: rule.note,
      date: due,
    });
    await income.save();

    rule.lastGeneratedDate = due;
    due = nextDate(due, rule.frequency);
    created++;
  }

  rule.nextDueDate = due;

  if (rule.endDate && due > new Date(rule.endDate)) {
    rule.isActive = false;
  }

  await rule.save();
  return created;
}

/* ─── GET /recurring-incomes ──────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  try {
    const rules = await RecurringIncome.find({ user: req.user._id })
      .populate('category', 'name color icon')
      .sort({ createdAt: -1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── POST /recurring-incomes ─────────────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const { category, amount, note, frequency, startDate, endDate } = req.body;

    if (!category || !amount || !frequency || !startDate) {
      return res.status(400).json({ error: 'category, amount, frequency, and startDate are required.' });
    }

    const start = new Date(startDate);

    const rule = new RecurringIncome({
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
    await generateDueEntries(rule);

    const populated = await RecurringIncome.findById(rule._id)
      .populate('category', 'name color icon');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── PUT /recurring-incomes/:id ──────────────────────────────────────── */
exports.update = async (req, res) => {
  try {
    const rule = await RecurringIncome.findOne({ _id: req.params.id, user: req.user._id });
    if (!rule) return res.status(404).json({ error: 'Not found' });

    const { category, amount, note, frequency, endDate, isActive } = req.body;

    if (category  !== undefined) rule.category  = category;
    if (amount    !== undefined) rule.amount     = Number(amount);
    if (note      !== undefined) rule.note       = note;
    if (frequency !== undefined) rule.frequency  = frequency;
    if (endDate   !== undefined) rule.endDate    = endDate ? new Date(endDate) : null;
    if (isActive  !== undefined) rule.isActive   = isActive;

    await rule.save();

    const populated = await RecurringIncome.findById(rule._id)
      .populate('category', 'name color icon');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── DELETE /recurring-incomes/:id ───────────────────────────────────── */
exports.remove = async (req, res) => {
  try {
    const rule = await RecurringIncome.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!rule) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── POST /recurring-incomes/process ────────────────────────────────── */
exports.process = async (req, res) => {
  try {
    const now = new Date();
    const dueRules = await RecurringIncome.find({
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
