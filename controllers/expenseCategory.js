const ExpenseCategory = require('../models/ExpenseCategory');

// ─── default seed data ──────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  {
    name: 'Necessities', icon: '🏠', color: '#3b82f6', isParent: true,
    children: [
      { name: 'Rent / Mortgage',  icon: '🏡', color: '#60a5fa' },
      { name: 'Groceries',        icon: '🛒', color: '#60a5fa' },
      { name: 'Utilities',        icon: '💡', color: '#60a5fa' },
      { name: 'Transport',        icon: '🚌', color: '#60a5fa' },
      { name: 'Phone Bill',       icon: '📱', color: '#60a5fa' },
      { name: 'Internet',         icon: '🌐', color: '#60a5fa' },
      { name: 'Health / Medical', icon: '🏥', color: '#60a5fa' },
      { name: 'Insurance',        icon: '🛡️', color: '#60a5fa' },
    ],
  },
  {
    name: 'Wants', icon: '✨', color: '#f59e0b', isParent: true,
    children: [
      { name: 'Restaurant',       icon: '🍽️', color: '#fcd34d' },
      { name: 'Snacks',           icon: '🍫', color: '#fcd34d' },
      { name: 'Drinks / Coffee',  icon: '☕', color: '#fcd34d' },
      { name: 'Shopping',         icon: '🛍️', color: '#fcd34d' },
      { name: 'Entertainment',    icon: '🎮', color: '#fcd34d' },
      { name: 'Subscriptions',    icon: '📺', color: '#fcd34d' },
      { name: 'Travel',           icon: '✈️', color: '#fcd34d' },
      { name: 'Fitness',          icon: '💪', color: '#fcd34d' },
    ],
  },
  {
    name: 'Savings & Investments', icon: '💰', color: '#22c55e', isParent: true,
    children: [
      { name: 'Emergency Fund',   icon: '🆘', color: '#4ade80' },
      { name: 'Mutual Funds',     icon: '📈', color: '#4ade80' },
      { name: 'Stocks',           icon: '📊', color: '#4ade80' },
      { name: 'Fixed Deposit',    icon: '🏦', color: '#4ade80' },
      { name: 'Crypto',           icon: '₿',  color: '#4ade80' },
    ],
  },
  {
    name: 'Personal', icon: '👤', color: '#8b5cf6', isParent: true,
    children: [
      { name: 'Education',        icon: '📚', color: '#a78bfa' },
      { name: 'Grooming',         icon: '💇', color: '#a78bfa' },
      { name: 'Gifts',            icon: '🎁', color: '#a78bfa' },
      { name: 'Charity',          icon: '❤️', color: '#a78bfa' },
    ],
  },
  {
    name: 'Other', icon: '📦', color: '#6b7280', isParent: true,
    children: [
      { name: 'Miscellaneous',    icon: '🔖', color: '#9ca3af' },
    ],
  },
];

// GET /expense-categories
// Returns { parents: [...], children: [...] } for hierarchical UI
// Falls back to flat array for backwards compat when ?flat=true
const getExpenseCategories = async (req, res) => {
  try {
    const all = await ExpenseCategory.find({ user: req.user._id }).lean();

    if (req.query.flat === 'true') {
      return res.status(200).json(all);
    }

    const parents = all.filter((c) => c.isParent);
    const children = all.filter((c) => !c.isParent);

    // Attach children to each parent
    const tree = parents.map((parent) => ({
      ...parent,
      subcategories: children.filter(
        (c) => c.parentCategory && c.parentCategory.toString() === parent._id.toString()
      ),
    }));

    // Include orphan sub-categories (parentCategory not found in parents)
    const parentIds = new Set(parents.map((p) => p._id.toString()));
    const orphans = children.filter(
      (c) => !c.parentCategory || !parentIds.has(c.parentCategory.toString())
    );

    res.status(200).json({ tree, orphans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /expense-categories
// Body: { name, icon, color, parentCategory?, isParent? }
const addExpenseCategory = async (req, res) => {
  try {
    const { name, icon, color, parentCategory, isParent } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const existing = await ExpenseCategory.findOne({
      user: req.user._id,
      name: name.trim(),
      parentCategory: parentCategory || null,
    });

    if (existing) {
      return res.status(400).json({ error: 'Category already exists at this level' });
    }

    // If parentCategory given, ensure it exists and belongs to user
    if (parentCategory) {
      const parent = await ExpenseCategory.findOne({ _id: parentCategory, user: req.user._id });
      if (!parent) {
        return res.status(400).json({ error: 'Parent category not found' });
      }
    }

    const category = new ExpenseCategory({
      user: req.user._id,
      name: name.trim(),
      ...(icon  ? { icon }  : {}),
      ...(color ? { color } : {}),
      parentCategory: parentCategory || null,
      isParent: !parentCategory && (isParent === true),
    });

    await category.save();
    res.status(201).json({ message: 'Expense category created successfully', category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /expense-categories/:id
const updateExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, color } = req.body;

    if (!name && !icon && color === undefined) {
      return res.status(400).json({ error: 'At least one field is required' });
    }

    const category = await ExpenseCategory.findOne({ _id: id, user: req.user._id });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (name && name.trim() !== category.name) {
      const existing = await ExpenseCategory.findOne({
        user: req.user._id,
        name: name.trim(),
        parentCategory: category.parentCategory,
        _id: { $ne: id },
      });

      if (existing) {
        return res.status(400).json({ error: 'Category name already exists at this level' });
      }
    }

    if (name)             category.name  = name.trim();
    if (icon !== undefined)  category.icon  = icon;
    if (color !== undefined) category.color = color;

    await category.save();
    res.status(200).json({ message: 'Expense category updated successfully', category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /expense-categories/:id
const deleteExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await ExpenseCategory.findOneAndDelete({ _id: id, user: req.user._id });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // If this was a parent, delete its children too
    if (category.isParent) {
      await ExpenseCategory.deleteMany({ user: req.user._id, parentCategory: category._id });
    }

    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /expense-categories/seed
// Seeds default parent + sub-categories — skips any that already exist
const seedDefaultCategories = async (req, res) => {
  try {
    let created = 0;

    for (const group of DEFAULT_CATEGORIES) {
      let parent = await ExpenseCategory.findOne({
        user: req.user._id, name: group.name, isParent: true,
      });

      if (!parent) {
        parent = await ExpenseCategory.create({
          user: req.user._id,
          name: group.name,
          icon: group.icon,
          color: group.color,
          isParent: true,
          parentCategory: null,
        });
        created++;
      }

      for (const child of group.children) {
        const exists = await ExpenseCategory.findOne({
          user: req.user._id, name: child.name, parentCategory: parent._id,
        });
        if (!exists) {
          await ExpenseCategory.create({
            user: req.user._id,
            name: child.name,
            icon: child.icon,
            color: child.color,
            isParent: false,
            parentCategory: parent._id,
          });
          created++;
        }
      }
    }

    res.status(200).json({ message: `Seeded ${created} categories` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getExpenseCategories,
  addExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  seedDefaultCategories,
};
