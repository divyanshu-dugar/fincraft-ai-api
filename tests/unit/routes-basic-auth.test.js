const request = require('supertest');
const jwt = require('jsonwebtoken');

const ok = (req, res) => res.status(200).json({ ok: true, path: req.path });

// Mock controllers so authenticated requests don't require MongoDB
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

describe('Protected routes support JWT (default) and Basic Auth (dev/tests)', () => {
  const basicUser = 'test-user1@fincraft-testing.com';
  const basicPass = 'test-password1';

  const jwtToken = jwt.sign(
    { _id: '507f1f77bcf86cd799439011', userName: 'jwt-user', role: 'user' },
    process.env.JWT_SECRET
  );

  const cases = [
    { method: 'get', path: '/expenses' },
    { method: 'get', path: '/expense-categories' },
    { method: 'get', path: '/income' },
    { method: 'get', path: '/income-categories' },
    { method: 'get', path: '/saving-goals' },
    { method: 'get', path: '/budgets' },
    { method: 'get', path: '/api/chat-sessions' },
  ];

  test.each(cases)('denies unauthenticated: %s %s', async ({ method, path }) => {
    const app = require('../../app');
    const res = await request(app)[method](path);
    expect(res.statusCode).toBe(401);
  });

  test.each(cases)('accepts Basic Auth: %s %s', async ({ method, path }) => {
    const app = require('../../app');
    const res = await request(app)[method](path).auth(basicUser, basicPass);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test.each(cases)('accepts JWT: %s %s', async ({ method, path }) => {
    const app = require('../../app');
    const res = await request(app)[method](path).set('Authorization', `jwt ${jwtToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
