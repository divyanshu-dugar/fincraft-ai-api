const express = require("express");
const router = express.Router();
const requireAuth = require('../auth/require-auth');
const {
  getSavingGoals,
  getSavingGoal,
  addSavingGoal,
  deleteSavingGoal,
  updateSavingGoal,
  updateSavedAmount,
  addContribution,
  deleteContribution
} = require("../controllers/savingsGoalList");

// Protect all routes
router.get("/", requireAuth(), getSavingGoals);
router.post("/", requireAuth(), addSavingGoal);
router.get("/:id", requireAuth(), getSavingGoal);
router.delete("/:id", requireAuth(), deleteSavingGoal);
router.put("/:id", requireAuth(), updateSavingGoal);
router.put('/:id/save', requireAuth(), updateSavedAmount);
router.post("/:id/contribute", requireAuth(), addContribution);
router.delete("/:goalId/contribute/:contributionId", requireAuth(), deleteContribution);

module.exports = router;
