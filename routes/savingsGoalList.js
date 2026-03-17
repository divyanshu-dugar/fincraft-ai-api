const express = require("express");
const router = express.Router();
const requireAuth = require('../auth/require-auth');
const {
  getSavingGoals,
  addSavingGoal,
  deleteSavingGoal,
  updateSavingGoal,
  updateSavedAmount
} = require("../controllers/savingsGoalList");

// Protect all routes
router.get("/", requireAuth(), getSavingGoals);
router.post("/", requireAuth(), addSavingGoal);
router.delete("/:id", requireAuth(), deleteSavingGoal);
router.put("/:id", requireAuth(), updateSavingGoal);
router.put('/:id/save', requireAuth(), updateSavedAmount);

module.exports = router;
