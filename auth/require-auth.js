const passport = require('passport');
const { isBasicAuthEnabled } = require('./index');

/**
 * Authenticate with JWT (default) or Basic Auth (when enabled).
 *
 * - If the request includes an Authorization header beginning with "Basic ",
 *   and `HTPASSWD_FILE` is configured in non-production, Basic Auth is used.
 * - Otherwise, JWT auth is used (current production behavior).
 */
module.exports = function requireAuth() {
  return function (req, res, next) {
    const authHeader = String(req.headers.authorization || '');
    const isBasic = authHeader.toLowerCase().startsWith('basic ');

    if (isBasic && isBasicAuthEnabled()) {
      // Use the wrapper so Basic Auth produces the same req.user shape
      // expected by controllers (requires `_id`, `userName`).
      const basicAuth = require('./basic-auth');
      return basicAuth.authenticate()(req, res, next);
    }

    return passport.authenticate('jwt', { session: false })(req, res, next);
  };
};
