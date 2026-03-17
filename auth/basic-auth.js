const auth = require('http-auth');
const authPassport = require('http-auth-passport');
const authorize = require('./auth-middleware');

/**
 * HTTP Basic Auth (dev/test only).
 *
 * Enabled when `HTPASSWD_FILE` is set and `NODE_ENV !== 'production'`.
 * The `.htpasswd` file contains bcrypt hashes for usernames.
 */
if (!process.env.HTPASSWD_FILE) {
  throw new Error('missing expected env var: HTPASSWD_FILE');
}

module.exports.strategy = () => {
  return authPassport(
    auth.basic({
      file: process.env.HTPASSWD_FILE,
    })
  );
};

module.exports.authenticate = () => authorize('http');
