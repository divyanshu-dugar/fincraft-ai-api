const SavingsGoalList = require("../models/SavingsGoalList");
const generateEmbedding = require('../utils/generateEmbedding');

// ✅ Get all savings goals for logged-in user
const getSavingGoals = async (req, res) => {
  try {
    const userId = req.user._id;
    const savingsGoalList = await SavingsGoalList.find({ user: userId }).sort({ createdAt: -1 });
    res.json(savingsGoalList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Add a new savings goal for logged-in user
const addSavingGoal = async (req, res) => {
  try {
    const { name, amount, deadline, priority, description } = req.body;

    if (!name || !amount || !deadline || !priority) {
      return res.status(400).json({ error: "All required fields must be provided." });
    }

    const semanticText = `Saving goal "${name}" target ${amount}, currently saved 0 by ${deadline}. Priority: ${priority}. Description: ${description || 'None'}`;
    const embeddingArray = await generateEmbedding(semanticText);

    const newGoal = new SavingsGoalList({
      user: req.user._id,
      name,
      amount,
      deadline,
      priority,
      description,
      embedding: embeddingArray
    });

    const savedGoal = await newGoal.save();
    res.status(201).json(savedGoal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete a savings goal (only if owned by user)
const deleteSavingGoal = async (req, res) => {
  try {
    const userId = req.user._id;
    const goalId = req.params.id;

    const deletedGoal = await SavingsGoalList.findOneAndDelete({
      _id: goalId,
      user: userId,
    });

    if (!deletedGoal) {
      return res.status(404).json({ error: "Savings goal not found or unauthorized" });
    }

    res.json({ message: "Goal deleted successfully", deletedGoal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update a savings goal (only if owned by user)
const updateSavingGoal = async (req, res) => {
  try {
    const userId = req.user._id;
    const goalId = req.params.id;
    const updates = req.body;

    const updatedGoal = await SavingsGoalList.findOneAndUpdate(
      { _id: goalId, user: userId },
      updates,
      { new: true }
    );

    if (!updatedGoal) {
      return res.status(404).json({ error: "Savings goal not found or unauthorized" });
    }

    const semanticText = `Saving goal "${updatedGoal.name}" target ${updatedGoal.amount}, currently saved ${updatedGoal.savedAmount || 0} by ${updatedGoal.deadline}. Priority: ${updatedGoal.priority}. Description: ${updatedGoal.description || 'None'}`;
    const embeddingArray = await generateEmbedding(semanticText);
    
    updatedGoal.embedding = embeddingArray;
    await updatedGoal.save();

    res.json(updatedGoal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /saving-goals/:id/save
const updateSavedAmount = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { savedAmount } = req.body;

    if (savedAmount == null || isNaN(Number(savedAmount))) {
      return res.status(400).json({ message: "savedAmount must be a number" });
    }
    
    // Update only if owned by user
    const goal = await SavingsGoalList.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { savedAmount: Number(savedAmount) },
      { new: true, runValidators: true }
    );

    if (!goal) {
      return res.status(404).json({ message: "Savings goal not found or unauthorized" });
    }

    const semanticText = `Saving goal "${goal.name}" target ${goal.amount}, currently saved ${goal.savedAmount || 0} by ${goal.deadline}. Priority: ${goal.priority}. Description: ${goal.description || 'None'}`;
    const embeddingArray = await generateEmbedding(semanticText);
    goal.embedding = embeddingArray;
    await goal.save();

    res.json(goal);
  } catch (err) {
    console.error("Error updating saved amount:", err.message);
    res.status(500).json({ message: "Error updating saved amount", error: err.message });
  }
};

// GET /saving-goals/:id
const getSavingGoal = async (req, res) => {
  try {
    const goal = await SavingsGoalList.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) {
      return res.status(404).json({ error: "Savings goal not found or unauthorized" });
    }
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /saving-goals/:id/contribute
const addContribution = async (req, res) => {
  try {
    const { amount, note } = req.body;
    const parsedAmount = Number(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: "Contribution amount must be a positive number." });
    }

    const goal = await SavingsGoalList.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) {
      return res.status(404).json({ error: "Savings goal not found or unauthorized" });
    }

    goal.contributions.push({ amount: parsedAmount, note: note || "" });
    goal.savedAmount = goal.contributions.reduce((sum, c) => sum + c.amount, 0);

    const semanticText = `Saving goal "${goal.name}" target ${goal.amount}, currently saved ${goal.savedAmount} by ${goal.deadline}. Priority: ${goal.priority}. Description: ${goal.description || 'None'}`;
    goal.embedding = await generateEmbedding(semanticText);

    await goal.save();
    res.status(201).json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /saving-goals/:goalId/contribute/:contributionId
const deleteContribution = async (req, res) => {
  try {
    const goal = await SavingsGoalList.findOne({ _id: req.params.goalId, user: req.user._id });
    if (!goal) {
      return res.status(404).json({ error: "Savings goal not found or unauthorized" });
    }

    const contribIndex = goal.contributions.findIndex(
      (c) => c._id.toString() === req.params.contributionId
    );
    if (contribIndex === -1) {
      return res.status(404).json({ error: "Contribution not found" });
    }

    goal.contributions.splice(contribIndex, 1);
    goal.savedAmount = goal.contributions.reduce((sum, c) => sum + c.amount, 0);

    const semanticText = `Saving goal "${goal.name}" target ${goal.amount}, currently saved ${goal.savedAmount} by ${goal.deadline}. Priority: ${goal.priority}. Description: ${goal.description || 'None'}`;
    goal.embedding = await generateEmbedding(semanticText);

    await goal.save();
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getSavingGoals,
  getSavingGoal,
  addSavingGoal,
  deleteSavingGoal,
  updateSavingGoal,
  updateSavedAmount,
  addContribution,
  deleteContribution
};
