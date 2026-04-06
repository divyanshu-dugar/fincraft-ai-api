const express = require('express');
const router = express.Router();
const requireAuth = require('../auth/require-auth');
const {
  getAll,
  create,
  update,
  remove,
  process,
} = require('../controllers/recurringIncome');

router.get('/',          requireAuth(), getAll);
router.post('/',         requireAuth(), create);
router.post('/process',  requireAuth(), process);
router.put('/:id',       requireAuth(), update);
router.delete('/:id',    requireAuth(), remove);

module.exports = router;
