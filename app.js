const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const passport = require('passport');

const configurePassport = require('./config/passport');

// Route imports
const expense = require('./routes/expense');
const expenseCategory = require('./routes/expenseCategory');
const income = require('./routes/income');
const incomeCategory = require('./routes/incomeCategory');
const savingsGoalList = require('./routes/savingsGoalList');
const budgetRoutes = require('./routes/budget');
const analytics = require('./routes/analytics'); // ✅ New
const aiChat = require('./routes/ai')
const recurringExpenseRoutes = require('./routes/recurringExpense');
const recurringIncomeRoutes = require('./routes/recurringIncome');
const cashFlowForecastRoutes = require('./routes/cashFlowForecast');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');

const app = express();

const staticAllowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'https://fincraft-ai-app.vercel.app',
  'https://www.fincraft-ai.app',
  'https://fincraft-ai.app'
]);

const envAllowedOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

for (const origin of envAllowedOrigins) {
  staticAllowedOrigins.add(origin);
}

function isAllowedOrigin(origin) {
  if (staticAllowedOrigins.has(origin)) {
    return true;
  }

  // Allow localhost and local network web dev servers during development.
  if (process.env.NODE_ENV !== 'production') {
    const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;
    if (localDevOriginPattern.test(origin)) {
      return true;
    }
  }

  return false;
}

// Passport strategies (JWT always, optional Basic in non-production)
configurePassport();
app.use(passport.initialize());

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Requests from native apps or tools may not send an Origin header.
    if (!origin) {
      return callback(null, true);
    }

    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS: Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Root route
app.get('/', (req, res) => {
  res.send("Server running!");
});

const mongoose = require('mongoose');
const { version } = require('./package.json');

// API Routes — all mounted under /api/v1/* for versioning
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/expenses', expense);
app.use('/api/v1/expense-categories', expenseCategory);
app.use('/api/v1/income', income);
app.use('/api/v1/income-categories', incomeCategory);
app.use('/api/v1/saving-goals', savingsGoalList);
app.use('/api/v1/budgets', budgetRoutes);
app.use('/api/v1/recurring-expenses', recurringExpenseRoutes);
app.use('/api/v1/recurring-incomes', recurringIncomeRoutes);
app.use('/api/v1/cash-flow-forecast', cashFlowForecastRoutes);
app.use('/api/v1', analytics);
app.use('/api/v1', aiChat);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    database: dbStatus,
    uptime: process.uptime(),
    version: version,
    nodeEnv: process.env.NODE_ENV || '(unset)',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
