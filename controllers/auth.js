const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../utils/email');

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/api/auth',
};

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Register User
exports.registerUser = async (req, res) => {
  try {
    const { userName, email, password, role } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existingUser = await User.findOne({ $or: [{ userName }, { email: email.toLowerCase() }] });
    if (existingUser) {
      if (existingUser.userName === userName) {
        return res.status(400).json({ message: "Username already taken" });
      }
      return res.status(400).json({ message: "Email already registered" });
    }

    const newUser = new User({ userName, email, password, role });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Login User
exports.loginUser = async (req, res) => {
  try {
    const { userName, password } = req.body;

    const user = await User.findOne({ userName });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    // Short-lived access token (15 min)
    const payload = {
      _id: user._id,
      userName: user.userName,
      role: user.role
    };
    const token = signAccessToken(payload);

    // Long-lived refresh token stored as httpOnly cookie
    const rawRefresh = user.createRefreshToken();
    await user.save({ validateBeforeSave: false });

    res.cookie(REFRESH_COOKIE_NAME, rawRefresh, REFRESH_COOKIE_OPTIONS);
    res.json({ message: "Login successful", token, role: user.role });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

// Refresh Access Token – validates the httpOnly refresh token cookie and rotates it
exports.refreshAccessToken = async (req, res) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken) {
      return res.status(401).json({ message: "No refresh token provided" });
    }

    const tokenHash = hashToken(rawToken);
    const user = await User.findOne({
      'refreshTokens.tokenHash': tokenHash,
      'refreshTokens.expiresAt': { $gt: new Date() },
    });

    if (!user) {
      // Possible token reuse — clear the cookie regardless
      res.clearCookie(REFRESH_COOKIE_NAME, { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
      return res.status(401).json({ message: "Refresh token is invalid or expired" });
    }

    // Rotate: remove the used token, issue a new one
    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
    const rawRefresh = user.createRefreshToken();
    await user.save({ validateBeforeSave: false });

    const payload = {
      _id: user._id,
      userName: user.userName,
      role: user.role,
    };
    const token = signAccessToken(payload);

    res.cookie(REFRESH_COOKIE_NAME, rawRefresh, REFRESH_COOKIE_OPTIONS);
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Token refresh failed", error: error.message });
  }
};

// Logout User – revokes the refresh token
exports.logoutUser = async (req, res) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      await User.updateOne(
        { 'refreshTokens.tokenHash': tokenHash },
        { $pull: { refreshTokens: { tokenHash } } }
      );
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Logout failed", error: error.message });
  }
};

// Forgot Password – sends reset email
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: "If an account with that email exists, a reset link has been sent." });
    }

    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user.email, rawToken);
    } catch (emailErr) {
      // Roll back the token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ message: "Failed to send reset email. Please try again." });
    }

    res.json({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (error) {
    res.status(500).json({ message: "Something went wrong", error: error.message });
  }
};

// Reset Password – validates token and sets new password
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Reset link is invalid or has expired" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    res.status(500).json({ message: "Password reset failed", error: error.message });
  }
};