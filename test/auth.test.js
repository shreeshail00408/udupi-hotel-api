const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, sanitizeUser, USER_ROLES } = require('../src/utils/auth');
const { authorize } = require('../src/middleware/auth');

test('normalizeEmail trims and lowercases email before storage', () => {
  assert.equal(normalizeEmail('  User.Name+Tag@Example.COM  '), 'user.name+tag@example.com');
});

test('sanitizeUser removes password material and keeps the role metadata', () => {
  const user = sanitizeUser({
    id: 9,
    full_name: 'Ananya Rao',
    email: 'ananya@example.com',
    phone: '9876543210',
    password_hash: 'hash',
    role: USER_ROLES.CUSTOMER,
    created_at: '2026-10-26T10:00:00.000Z',
    updated_at: '2026-10-26T10:00:00.000Z'
  });

  assert.deepEqual(user, {
    id: 9,
    full_name: 'Ananya Rao',
    email: 'ananya@example.com',
    phone: '9876543210',
    role: USER_ROLES.CUSTOMER,
    created_at: '2026-10-26T10:00:00.000Z',
    updated_at: '2026-10-26T10:00:00.000Z'
  });
});

test('admin authorization requires an exact ADMIN database role', () => {
  const middleware = authorize(USER_ROLES.ADMIN);
  for (const role of ['CUSTOMER', 'STAFF', 'ADMIN']) {
    let error;
    middleware({ user: { role } }, {}, err => { error = err; });
    assert.equal(Boolean(error), role !== USER_ROLES.ADMIN, `${role} authorization result`);
    if (error) assert.equal(error.status, 403);
  }
});

test('admin authorization requires an authenticated user', () => {
  let error;
  authorize(USER_ROLES.ADMIN)({}, {}, err => { error = err; });
  assert.equal(error.status, 401);
});
