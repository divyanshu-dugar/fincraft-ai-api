const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Root route
app.get('/', (req, res) => {
  res.send("Server running!");
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/expenses', expense);
app.use('/expense-categories', expenseCategory);
app.use('/income', income);
app.use('/income-categories', incomeCategory);
app.use('/saving-goals', savingsGoalList);
app.use('/budgets', budgetRoutes);
app.use('/recurring-expenses', recurringExpenseRoutes);
app.use('/recurring-incomes', recurringIncomeRoutes);
app.use('/api', analytics); 
app.use('/api', aiChat); // ✅ New AI route

module.exports = app;
