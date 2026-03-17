const passport = require('passport');
const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * Passport authentication wrapper that normalizes the authenticated user.
 *
 * For JWT, Passport will already set `req.user` based on the verified token.
 * For Basic Auth, the underlying strategy returns a username string; we convert
 * it to a user object compatible with existing controllers (requires `_id`).
 *
 * @param {string} strategyName Passport strategy name
 */
module.exports = (strategyName) => {
  return function (req, res, next) {
    function callback(err, user) {
      if (err) {
        console.warn('error authenticating user', err);
        return res.status(500).json({ error: 'Unable to authenticate user' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // For http-auth-passport (Basic), `user` is the username string.
      if (typeof user === 'string') {
        const userName = user;
        const digest = crypto.createHash('sha256').update(userName).digest('hex').slice(0, 24);
        req.user = {
          _id: new mongoose.Types.ObjectId(digest),
          userName,
          role: 'user',
        };
      } else {
        req.user = user;
      }

      next();
    }

    passport.authenticate(strategyName, { session: false }, callback)(req, res, next);
  };
};
