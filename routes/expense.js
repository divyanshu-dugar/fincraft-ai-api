const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
    getExpenses,
    getExpenseById,
    addExpense,
    editExpense,
    deleteExpense,
    getExpensesByCategory,
    getExpenseStats,
    getExpensesByCategoryAndDateRange,
  getCategoryMonthComparison,
    importExpenses,
    extractFromImage
} = require('../controllers/expense');
const requireAuth = require('../auth/require-auth');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use /tmp for temporary file storage
    cb(null, '/tmp');
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'wallet-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow only image files
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, png, webp, gif)'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// All routes are protected
router.get('/', requireAuth(), getExpenses);
router.get('/stats', requireAuth(), getExpenseStats);
router.get('/analytics/category-month-comparison', requireAuth(), getCategoryMonthComparison);
router.get('/category/:category', requireAuth(), getExpensesByCategory);
router.get('/category/:category/date-range', requireAuth(), getExpensesByCategoryAndDateRange); 
router.get('/:id', requireAuth(), getExpenseById);
router.post('/', requireAuth(), addExpense);
router.post('/import', requireAuth(), importExpenses);
router.post('/extract-from-image', requireAuth(), upload.single('image'), extractFromImage);
router.put('/:id', requireAuth(), editExpense);
router.delete('/:id', requireAuth(), deleteExpense);

module.exports = router;