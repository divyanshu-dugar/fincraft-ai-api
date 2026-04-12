const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * GET /api/profile
 * Returns the authenticated user's public profile fields.
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -resetPasswordToken -resetPasswordExpires');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profile', error: err.message });
  }
};

/**
 * PATCH /api/profile
 * Updates mutable profile fields: userName, email.
 */
exports.updateProfile = async (req, res) => {
  try {
    const { userName, email } = req.body;

    if (!userName && !email) {
      return res.status(400).json({ message: 'Provide at least one field to update' });
    }

    // Check uniqueness for userName
    if (userName) {
      const clash = await User.findOne({ userName, _id: { $ne: req.user._id } });
      if (clash) return res.status(409).json({ message: 'Username already taken' });
    }

    // Check uniqueness for email
    if (email) {
      const clash = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: req.user._id } });
      if (clash) return res.status(409).json({ message: 'Email already registered' });
    }

    const updates = {};
    if (userName) updates.userName = userName.trim();
    if (email) updates.email = email.toLowerCase().trim();

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    res.json({ message: 'Profile updated successfully', user: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update profile', error: err.message });
  }
};

/**
 * PATCH /api/profile/change-password
 * Validates current password, then sets a new one.
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' });

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must differ from the current one' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to change password', error: err.message });
  }
};

/**
 * DELETE /api/profile
 * Permanently deletes the user's account and all associated data.
 * Requires password confirmation.
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password confirmation is required' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });

    const userId = req.user._id;

    // Delete all user data in parallel
    const [
      Expense,
      ExpenseCategory,
      Income,
      IncomeCategory,
      Budget,
      BudgetAlert,
      SavingsGoalList,
      ChatMessages,
      ChatSessions,
    ] = [
      require('../models/Expense'),
      require('../models/ExpenseCategory'),
      require('../models/Income'),
      require('../models/IncomeCategory'),
      require('../models/Budget'),
      require('../models/BudgetAlert'),
      require('../models/SavingsGoalList'),
      require('../models/ChatMessages'),
      require('../models/ChatSessions'),
    ];

    await Promise.all([
      Expense.deleteMany({ user: userId }),
      ExpenseCategory.deleteMany({ user: userId }),
      Income.deleteMany({ user: userId }),
      IncomeCategory.deleteMany({ user: userId }),
      Budget.deleteMany({ user: userId }),
      BudgetAlert.deleteMany({ user: userId }),
      SavingsGoalList.deleteMany({ user: userId }),
      ChatMessages.deleteMany({ user: userId }),
      ChatSessions.deleteMany({ user: userId }),
    ]);

    await User.findByIdAndDelete(userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete account', error: err.message });
  }
};

/**
 * PATCH /api/profile/currencies
 * Body: { currencies: [{ code, symbol, name }], defaultCurrency: string }
 * Replaces the user's currency list and/or default currency in one call.
 */
exports.updateCurrencies = async (req, res) => {
  try {
    const { currencies, defaultCurrency } = req.body;

    if (!currencies && !defaultCurrency) {
      return res.status(400).json({ message: 'Provide currencies or defaultCurrency' });
    }

    if (currencies !== undefined) {
      if (!Array.isArray(currencies) || currencies.length === 0) {
        return res.status(400).json({ message: 'currencies must be a non-empty array' });
      }
      const valid = currencies.every(
        (c) => typeof c.code === 'string' && typeof c.symbol === 'string' && typeof c.name === 'string'
      );
      if (!valid) {
        return res.status(400).json({ message: 'Each currency must have code, symbol, and name' });
      }
    }

    const updates = {};
    if (currencies) updates.currencies = currencies;
    if (defaultCurrency) {
      // defaultCurrency must exist in the final currencies list
      const finalCurrencies = currencies ?? (await User.findById(req.user._id).select('currencies')).currencies;
      const exists = finalCurrencies.some((c) => c.code === defaultCurrency);
      if (!exists) {
        return res.status(400).json({ message: 'defaultCurrency must be in the currencies list' });
      }
      updates.defaultCurrency = defaultCurrency;
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('currencies defaultCurrency');

    res.json({ message: 'Currency preferences updated', currencies: updated.currencies, defaultCurrency: updated.defaultCurrency });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update currencies', error: err.message });
  }
};

