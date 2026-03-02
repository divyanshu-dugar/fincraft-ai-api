const express = require("express")
const router = express.Router()
const aiChatController = require('../controllers/aiChat');
const passport = require('passport');

const authenticate = passport.authenticate('jwt', { session: false });

// Create a new chat session
router.post("/chat-session", authenticate, aiChatController.createChatSession);

// Get all chat sessions for user
router.get("/chat-sessions", authenticate, aiChatController.getChatSessions);

// Get messages for a specific session
router.get("/chat-sessions/:sessionId/messages", authenticate, aiChatController.getSessionMessages);

// Send a message in a session
router.post("/chat-message", authenticate, aiChatController.sendMessage);

// Delete a chat session
router.delete("/chat-sessions/:sessionId", authenticate, aiChatController.deleteChatSession);

module.exports = router;