const ExpenseCategory = require('../models/ExpenseCategory');

// Get all expense categories for the logged-in user
const getExpenseCategories = async (req, res) => {
  try {
    const categories = await ExpenseCategory.find({ user: req.user._id });
    res.status(200).json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create a new expense category
const addExpenseCategory = async (req, res) => {
  try {
    const { name, icon, color } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Check if category already exists
    const existing = await ExpenseCategory.findOne({
      user: req.user._id,
      name: name.trim(),
    });

    if (existing) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const category = new ExpenseCategory({
      user: req.user._id,
      name: name.trim(),
      icon: icon || null,
      color: color || null,
    });

    await category.save();
    res.status(201).json({
      message: 'Expense category created successfully',
      category,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update an expense category
const updateExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, color } = req.body;

    // Validate that at least one field is provided
    if (!name && !icon && color === undefined) {
      return res.status(400).json({ error: 'At least one field is required' });
    }

    // Find and verify ownership
    const category = await ExpenseCategory.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check for duplicate name if name is being updated
    if (name && name.trim() !== category.name) {
      const existing = await ExpenseCategory.findOne({
        user: req.user._id,
        name: name.trim(),
        _id: { $ne: id },
      });

      if (existing) {
        return res.status(400).json({ error: 'Category name already exists' });
      }
    }

    // Update fields
    if (name) category.name = name.trim();
    if (icon !== undefined) category.icon = icon;
    if (color !== undefined) category.color = color;

    await category.save();
    res.status(200).json({
      message: 'Expense category updated successfully',
      category,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete an expense category
const deleteExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await ExpenseCategory.findOneAndDelete({
      _id: id,
      user: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getExpenseCategories,
  addExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
};
