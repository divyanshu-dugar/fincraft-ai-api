const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Route imports
const expense = require('./routes/expense');
const expenseCategory = require('./routes/expenseCategory');
const income = require('./routes/income');
const incomeCategory = require('./routes/incomeCategory');
const savingsGoalList = require('./routes/savingsGoalList');
const budgetRoutes = require('./routes/budget');
const analytics = require('./routes/analytics'); // ✅ New
const authRoutes = require('./routes/auth');

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://fincraft-ai-app.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Root route
app.get('/', (req, res) => {
  res.send("Server running!");
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/expenses', expense);
app.use('/expense-categories', expenseCategory);
app.use('/income', income);
app.use('/income-categories', incomeCategory);
app.use('/saving-goals', savingsGoalList);
app.use('/budgets', budgetRoutes);
app.use('/api', analytics); // ✅ New AI route

module.exports = app;
