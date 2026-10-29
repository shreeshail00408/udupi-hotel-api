const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const USER_ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN'
});

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function sanitizeUser(user = {}) {
  const safeUser = { ...user };
  delete safeUser.password;
  delete safeUser.password_hash;
  return safeUser;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signAccessToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a secure value in .env');
  }
  return jwt.sign({ sub: String(userId) }, secret, { expiresIn: '1h', issuer: 'udupi-hotel-api' });
}

function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a secure value in .env');
  }
  return jwt.verify(token, secret, { issuer: 'udupi-hotel-api' });
}

module.exports = {
  USER_ROLES,
  normalizeEmail,
  sanitizeUser,
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken
};
