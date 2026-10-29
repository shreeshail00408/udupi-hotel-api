#!/usr/bin/env node
require('dotenv').config();

const pool = require('../src/config/db');
const { hashPassword, normalizeEmail, USER_ROLES } = require('../src/utils/auth');

async function main() {
  const currentEmail = normalizeEmail(process.env.ADMIN_RESET_EMAIL || '');
  const newEmail = normalizeEmail(process.env.ADMIN_EMAIL || '');
  const password = process.env.ADMIN_PASSWORD || '';
  const fullName = process.env.ADMIN_NAME || 'Restaurant Admin';
  const phone = process.env.ADMIN_PHONE || '0000000000';

  if (!currentEmail || !newEmail || !password) {
    throw new Error('Set ADMIN_RESET_EMAIL, ADMIN_EMAIL, and ADMIN_PASSWORD in .env before resetting the admin.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new Error('ADMIN_RESET_EMAIL and ADMIN_EMAIL must be valid email addresses.');
  }
  if (password.length < 8 || password.length > 72) {
    throw new Error('ADMIN_PASSWORD must be between 8 and 72 characters.');
  }

  const [admins] = await pool.execute(
    'SELECT id FROM users WHERE email = ? AND role = ? LIMIT 1',
    [currentEmail, USER_ROLES.ADMIN]
  );
  if (!admins.length) {
    throw new Error('No admin account was found with ADMIN_RESET_EMAIL. No account was changed.');
  }

  const [emailOwners] = await pool.execute('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [
    newEmail,
    admins[0].id
  ]);
  if (emailOwners.length) {
    throw new Error('ADMIN_EMAIL is already used by another account. No account was changed.');
  }

  const passwordHash = await hashPassword(password);
  await pool.execute(
    'UPDATE users SET email = ?, full_name = ?, phone = ?, password_hash = ? WHERE id = ? AND role = ?',
    [newEmail, fullName, phone, passwordHash, admins[0].id, USER_ROLES.ADMIN]
  );

  console.log(`Admin credentials updated for ${newEmail}.`);
  console.log('Sign in with this email and ADMIN_PASSWORD from .env. No password was printed.');
}

main()
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
