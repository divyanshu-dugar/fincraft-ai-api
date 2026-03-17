/**
 * Auth feature flags for this API.
 *
 * - JWT is always enabled (configured in config/passport.js).
 * - Basic Auth is optional, and only intended for non-production.
 */

module.exports.isBasicAuthEnabled = function isBasicAuthEnabled() {
  return Boolean(process.env.HTPASSWD_FILE) && process.env.NODE_ENV !== 'production';
};
