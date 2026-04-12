const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: false, // OAuth users have no password
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // OAuth identifiers
  googleId: { type: String, sparse: true, default: null },
  appleId:  { type: String, sparse: true, default: null },
  avatar:   { type: String, default: null },
  // Multi-currency preferences
  defaultCurrency: { type: String, default: 'USD' },
  currencies: {
    type: [{
      code:   { type: String, required: true },
      symbol: { type: String, required: true },
      name:   { type: String, required: true },
    }],
    default: [{ code: 'USD', symbol: '$', name: 'US Dollar' }],
  },
  // Email verification
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  refreshTokens: [
    {
      tokenHash: { type: String, required: true },
      expiresAt: { type: Date, required: true },
    }
  ],
}, {
  timestamps: true
});

// Hash password before saving (only when password is present and modified)
userSchema.pre('save', async function(next) {
  if (!this.password || !this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method (safe for OAuth users with no password)
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate a password reset token (returns the raw token, stores the hash)
userSchema.methods.createPasswordResetToken = function() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  return rawToken;
};

// Generate an email verification token (returns raw token, stores hash)
userSchema.methods.createEmailVerificationToken = function() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return rawToken;
};

// Generate a refresh token (returns raw token, pushes hash into the array)
userSchema.methods.createRefreshToken = function() {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  // Prune expired tokens before pushing
  this.refreshTokens = this.refreshTokens.filter((t) => t.expiresAt > new Date());
  this.refreshTokens.push({ tokenHash, expiresAt });
  return rawToken;
};

module.exports = mongoose.model('User', userSchema);