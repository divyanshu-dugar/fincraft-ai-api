const passport = require('passport');
const passportJWT = require('passport-jwt');

/**
 * Configure Passport strategies for this API.
 *
 * - Always configures JWT auth (current production behavior).
 * - Optionally configures HTTP Basic Auth when `HTPASSWD_FILE` is set and
 *   `NODE_ENV !== 'production'` (intended for local/dev/testing only).
 */
module.exports = function configurePassport() {
  // JWT
  const ExtractJwt = passportJWT.ExtractJwt;
  const JwtStrategy = passportJWT.Strategy;

  const jwtOptions = {
    // NOTE: this API expects: Authorization: jwt <token>
    jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme('jwt'),
    secretOrKey: process.env.JWT_SECRET,
  };

  passport.use(
    new JwtStrategy(jwtOptions, function (jwtPayload, next) {
      if (jwtPayload) {
        next(null, {
          _id: jwtPayload._id,
          userName: jwtPayload.userName,
          role: jwtPayload.role,
        });
      } else {
        next(null, false);
      }
    })
  );

  // Optional Basic Auth (non-production only)
  if (process.env.HTPASSWD_FILE && process.env.NODE_ENV !== 'production') {
    const basicAuth = require('../auth/basic-auth');
    passport.use(basicAuth.strategy());
  }

  return passport;
};
