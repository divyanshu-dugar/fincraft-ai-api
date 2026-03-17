const request = require('supertest');
const jwt = require('jsonwebtoken');

const ok = (req, res) => res.status(200).json({ ok: true });

// Prevent Mongoose model initialization (open handles) by mocking controllers
jest.mock('../../controllers/expense', () => ({
  getExpenses: ok,
  getExpenseById: ok,
  addExpense: ok,
  editExpense: ok,
  deleteExpense: ok,
  getExpensesByCategory: ok,
  getExpenseStats: ok,
  getExpensesByCategoryAndDateRange: ok,
  importExpenses: ok,
}));

jest.mock('../../controllers/expenseCategory', () => ({
  getExpenseCategories: ok,
  addExpenseCategory: ok,
  updateExpenseCategory: ok,
  deleteExpenseCategory: ok,
}));

jest.mock('../../controllers/income', () => ({
  getIncomes: ok,
  getIncomeById: ok,
  addIncome: ok,
  editIncome: ok,
  deleteIncome: ok,
  getIncomesByCategory: ok,
  getIncomeStats: ok,
  getIncomesByCategoryAndDateRange: ok,
}));

jest.mock('../../controllers/incomeCategory', () => ({
  getIncomeCategories: ok,
  addIncomeCategory: ok,
  updateIncomeCategory: ok,
  deleteIncomeCategory: ok,
}));

jest.mock('../../controllers/savingsGoalList', () => ({
  getSavingGoals: ok,
  addSavingGoal: ok,
  deleteSavingGoal: ok,
  updateSavingGoal: ok,
  updateSavedAmount: ok,
}));

jest.mock('../../controllers/budget', () => ({
  getBudgets: ok,
  getBudgetById: ok,
  addBudget: ok,
  editBudget: ok,
  deleteBudget: ok,
  getBudgetStats: ok,
  checkBudgetAlerts: ok,
  getUserAlerts: ok,
  markAlertAsRead: ok,
}));

jest.mock('../../controllers/aiChat', () => ({
  createChatSession: ok,
  getChatSessions: ok,
  getSessionMessages: ok,
  sendMessage: ok,
  deleteChatSession: ok,
}));

jest.mock('../../controllers/auth', () => ({
  registerUser: ok,
  loginUser: ok,
}));

describe('GET /api/auth/me', () => {
  test('denies unauthenticated requests', async () => {
    const app = require('../../app');
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });

  test('accepts Basic Auth (when enabled)', async () => {
    const app = require('../../app');

    const res = await request(app)
      .get('/api/auth/me')
      .auth('test-user1@fincraft-testing.com', 'test-password1');

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.userName).toBe('test-user1@fincraft-testing.com');
    expect(String(res.body.user._id)).toMatch(/^[0-9a-f]{24}$/);
  });

  test('accepts JWT auth using the `jwt` scheme', async () => {
    const app = require('../../app');

    const token = jwt.sign(
      { _id: '507f1f77bcf86cd799439011', userName: 'jwt-user', role: 'user' },
      process.env.JWT_SECRET
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `jwt ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.userName).toBe('jwt-user');
    expect(res.body.user._id).toBe('507f1f77bcf86cd799439011');
  });
});
