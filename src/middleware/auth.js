const pool = require('../config/db');
const { httpError } = require('../utils/http');
const { sanitizeUser, verifyAccessToken } = require('../utils/auth');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return next(httpError(401, 'AUTH_REQUIRED', 'Authentication required'));
  }

  try {
    // Verify the token, then load the current database user so authorization never trusts a role from the token.
    const payload = verifyAccessToken(match[1]);
    if (!payload || !payload.sub) {
      return next(httpError(401, 'INVALID_TOKEN', 'Authentication failed'));
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!rows.length) {
      return next(httpError(401, 'INVALID_TOKEN', 'Authentication failed'));
    }

    req.user = sanitizeUser(rows[0]);
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return next(httpError(401, 'INVALID_TOKEN', 'Authentication failed'));
    }
    return next(err);
  }
}

// Admin-only routes compare the authenticated database role exactly; customers and legacy staff are never admins.
function authorize(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return next(httpError(401, 'AUTH_REQUIRED', 'Authentication required'));
    }

    if (req.user.role !== requiredRole) {
      return next(httpError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }

    return next();
  };
}

module.exports = { authenticate, authorize };
