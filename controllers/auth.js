const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../utils/email');
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_TTL_DEFAULT = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_TTL_REMEMBER = 90 * 24 * 60 * 60 * 1000; // 90 days

function refreshCookieOptions(rememberMe = false) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    // In prod, the SPA (fincraft-ai.app) and API (different origin) are
    // cross-site, so sameSite must be 'none' for the refresh cookie to be
    // sent with /auth/refresh calls. 'none' requires secure=true, which
    // prod has. In dev (http://localhost) we fall back to 'lax'.
    sameSite: isProd ? 'none' : 'lax',
    maxAge: rememberMe ? REFRESH_TTL_REMEMBER : REFRESH_TTL_DEFAULT,
    path: '/api/v1/auth',
  };
}

function signAccessToken(payload) {
  // 7 days. The silent-refresh flow still rotates the access token on each
  // authFetch, but a 7-day TTL means mobile Safari's ITP or transient network
  // hiccups won't immediately boot the user to /login. The refresh cookie
  // (30d default / 90d remember-me) remains the source of truth for session
  // length.
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
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
    const rawToken = newUser.createEmailVerificationToken();
    await newUser.save();

    try {
      await sendVerificationEmail(newUser.email, rawToken, userName);
    } catch (emailErr) {
      // Don't block registration if email fails — user can resend
    }

    res.status(201).json({ message: "Registration successful! Please check your email to verify your account." });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Login User
exports.loginUser = async (req, res) => {
  try {
    const { userName, password, rememberMe } = req.body;

    const user = await User.findOne({ userName });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email before signing in. Check your inbox or request a new link.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }

    // Short-lived access token (15 min)
    const payload = {
      _id: user._id,
      userName: user.userName,
      role: user.role
    };
    const token = signAccessToken(payload);

    // Long-lived refresh token stored as httpOnly cookie
    const ttl = rememberMe ? REFRESH_TTL_REMEMBER : REFRESH_TTL_DEFAULT;
    const rawRefresh = user.createRefreshToken(ttl);
    await user.save({ validateBeforeSave: false });

    res.cookie(REFRESH_COOKIE_NAME, rawRefresh, refreshCookieOptions(!!rememberMe));
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
      res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: 0 });
      return res.status(401).json({ message: "Refresh token is invalid or expired" });
    }

    // Rotate: remove the used token, issue a new one
    // Preserve the remaining TTL from the original token
    const usedToken = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
    const remainingTtl = usedToken ? usedToken.expiresAt - Date.now() : REFRESH_TTL_DEFAULT;
    const ttl = Math.max(remainingTtl, REFRESH_TTL_DEFAULT);
    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
    const rawRefresh = user.createRefreshToken(ttl);
    await user.save({ validateBeforeSave: false });

    const payload = {
      _id: user._id,
      userName: user.userName,
      role: user.role,
    };
    const token = signAccessToken(payload);

    const isRememberMe = ttl > REFRESH_TTL_DEFAULT;
    res.cookie(REFRESH_COOKIE_NAME, rawRefresh, refreshCookieOptions(isRememberMe));
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
    res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: 0 });
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

// ─── shared OAuth helper ────────────────────────────────────────────────────

/**
 * Find-or-create a user from a verified OAuth identity, then issue tokens.
 * @param {object} identity - { provider, providerId, email, name, avatar }
 */
async function handleOAuthUser(req, res, { provider, providerId, email, name, avatar }) {
  const idField = provider === 'google' ? 'googleId' : 'appleId';

  // 1. Try to find by provider ID (stable across sessions)
  let user = await User.findOne({ [idField]: providerId });

  // 2. Fall back to email match (links existing email/password account)
  if (!user && email) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      user[idField] = providerId;
      if (avatar && !user.avatar) user.avatar = avatar;
      user.isEmailVerified = true; // trust the OAuth provider's email
      await user.save({ validateBeforeSave: false });
    }
  }

  // 3. Create a brand-new user
  if (!user) {
    // Derive a unique userName from the email prefix or display name
    let baseUserName = (name || email.split('@')[0])
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 20) || 'user';

    let userName = baseUserName;
    let attempt = 0;
    while (await User.exists({ userName })) {
      attempt++;
      userName = `${baseUserName}${attempt}`;
    }

    user = new User({
      userName,
      email: email.toLowerCase(),
      [idField]: providerId,
      avatar: avatar || null,
      isEmailVerified: true, // Google/Apple have already verified the email
      // No password — OAuth user
    });
    await user.save({ validateBeforeSave: false });
  }

  // 4. Issue JWT + rotate refresh token (same as regular login)
  const payload = { _id: user._id, userName: user.userName, role: user.role };
  const token = signAccessToken(payload);
  const rawRefresh = user.createRefreshToken();
  await user.save({ validateBeforeSave: false });

  res.cookie('refresh_token', rawRefresh, refreshCookieOptions());
  res.json({ message: 'OAuth login successful', token, role: user.role });
}

// ─── Google OAuth ───────────────────────────────────────────────────────────
// POST /api/auth/oauth/google
// Body: { credential }  (the ID token from Google Identity Services)
exports.googleOAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Google credential is required' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    await handleOAuthUser(req, res, {
      provider:   'google',
      providerId: payload.sub,
      email:      payload.email,
      name:       payload.name,
      avatar:     payload.picture,
    });
  } catch (err) {
    res.status(401).json({ message: 'Google authentication failed', error: err.message });
  }
};

// ─── Apple OAuth ────────────────────────────────────────────────────────────
// POST /api/auth/oauth/apple
// Body: { idToken, email?, name? }
// Note: Apple only returns email and name on the VERY FIRST authorization.
// Store them in the user record; subsequent logins identify by sub.
exports.appleOAuth = async (req, res) => {
  try {
    const { idToken, email, name } = req.body;
    if (!idToken) return res.status(400).json({ message: 'Apple idToken is required' });

    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: process.env.APPLE_SERVICE_ID,
      ignoreExpiration: false,
    });

    // Apple email may come from the JWT payload or from the first-login body param
    const resolvedEmail = payload.email || email;
    if (!resolvedEmail) {
      return res.status(400).json({ message: 'Email is required for first-time Apple sign-in' });
    }

    await handleOAuthUser(req, res, {
      provider:   'apple',
      providerId: payload.sub,
      email:      resolvedEmail,
      name:       name || null,
      avatar:     null, // Apple doesn't provide an avatar
    });
  } catch (err) {
    res.status(401).json({ message: 'Apple authentication failed', error: err.message });
  }
};

// ─── Email Verification ──────────────────────────────────────────────────────

// GET /api/auth/verify-email?token=<raw>
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'Verification token is required' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Verification link is invalid or has expired' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ message: 'Email verified successfully! You can now sign in.' });
  } catch (error) {
    res.status(500).json({ message: 'Email verification failed', error: error.message });
  }
};

// POST /api/auth/resend-verification
// Body: { email }
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user || user.isEmailVerified) {
      return res.json({ message: 'If that account exists and is unverified, a new link has been sent.' });
    }

    const rawToken = user.createEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendVerificationEmail(user.email, rawToken, user.userName);
    } catch (emailErr) {
      return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }

    res.json({ message: 'If that account exists and is unverified, a new link has been sent.' });
  } catch (error) {
    res.status(500).json({ message: 'Something went wrong', error: error.message });
  }
};