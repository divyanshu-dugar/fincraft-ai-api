const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/auth');
const requireAuth = require('../auth/require-auth');

// Auth routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Simple authenticated "who am I" endpoint (JWT by default; Basic in dev/tests)
router.get('/me', requireAuth(), (req, res) => {
	res.json({ user: req.user });
});

module.exports = router;