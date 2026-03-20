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

module.exports = {
  getSavingGoals,
  addSavingGoal,
  deleteSavingGoal,
  updateSavingGoal,
  updateSavedAmount
};
