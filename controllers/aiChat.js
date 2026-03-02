const ChatSession = require('../models/ChatSessions');
const ChatMessage = require('../models/ChatMessages');
const axios = require('axios');

// Create a new chat session
exports.createChatSession = async (req, res) => {
  try {
    const { sessionName } = req.body;
    const userId = req.user._id;

    const session = new ChatSession({
      userId,
      sessionName: sessionName || `Conversation ${new Date().toLocaleDateString()}`,
    });

    await session.save();
    res.status(201).json({ sessionId: session._id, sessionName: session.sessionName });
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({ error: 'Failed to create chat session' });
  }
};

// Get all chat sessions for a user
exports.getChatSessions = async (req, res) => {
  try {
    const userId = req.user._id;

    const sessions = await ChatSession.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({ error: 'Failed to fetch chat sessions' });
  }
};

// Get messages for a specific session
exports.getSessionMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;

    // Verify session belongs to user
    const session = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = await ChatMessage.find({ sessionId })
      .sort({ createdAt: 1 })
      .lean();

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// Send a message and get AI response
exports.sendMessage = async (req, res) => {
  try {
    const { sessionId, userQuery } = req.body;
    const userId = req.user._id;

    // Verify session belongs to user
    const session = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Save user message
    const userMessage = new ChatMessage({
      sessionId,
      role: 'user',
      content: userQuery,
    });
    await userMessage.save();

    // Get AI response from Python backend
    const aiResponse = await axios.post('http://localhost:8000/api/ai/chat', {
      userQuery,
      userId: userId.toString(),
    });

    // Save assistant message
    const assistantMessage = new ChatMessage({
      sessionId,
      role: 'assistant',
      content: aiResponse.data,
    });
    await assistantMessage.save();

    // Update session name if it's the first message
    if (session.sessionName.includes('Conversation') && await ChatMessage.countDocuments({ sessionId }) <= 2) {
      const summary = userQuery.substring(0, 50);
      session.sessionName = summary;
      await session.save();
    }

    res.json({
      userMessage: userMessage,
      assistantMessage: assistantMessage,
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Delete a chat session
exports.deleteChatSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;

    // Verify session belongs to user
    const session = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete all messages in session
    await ChatMessage.deleteMany({ sessionId });
    // Delete session
    await ChatSession.deleteOne({ _id: sessionId });

    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
};
