const express = require('express');
const router = express.Router();
const {
  registerUser, loginUser, refreshAccessToken, logoutUser,
  forgotPassword, resetPassword, googleOAuth, appleOAuth,
  verifyEmail, resendVerification,
} = require('../controllers/auth');
const requireAuth = require('../auth/require-auth');

// Auth routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logoutUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);

// OAuth routes
router.post('/oauth/google', googleOAuth);
router.post('/oauth/apple',  appleOAuth);

// Simple authenticated "who am I" endpoint (JWT by default; Basic in dev/tests)
router.get('/me', requireAuth(), (req, res) => {
	res.json({ user: req.user });
});

module.exports = router;