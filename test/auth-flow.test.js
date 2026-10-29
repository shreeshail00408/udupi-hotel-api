const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/db');
const { hashPassword, USER_ROLES } = require('../src/utils/auth');

const base = () => new Promise(resolve => {
  const server = app.listen(0, () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}/api` }));
});

async function request(baseUrl, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

async function login(baseUrl, email, password) {
  const response = await request(baseUrl, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, 'Login should succeed');
  assert.ok(response.data.data.token, 'Login should return a JWT');
  return response.data.data;
}

async function seedUser({ name, email, password, role }) {
  const [result] = await pool.execute(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [name, email, '1234567890', await hashPassword(password), role]
  );
  return result.insertId;
}

test('customer and admin authentication, ordering, cancellation, and admin completion', async t => {
  const { server, baseUrl } = await base();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const customerEmail = `customer-${suffix}@example.com`;
  const otherEmail = `other-${suffix}@example.com`;
  const adminEmail = `admin-${suffix}@example.com`;
  const customerPassword = 'StrongPass123!';
  const adminPassword = 'AdminPass123!';
  const testOrderIds = [];
  let testMenuItemId;

  t.after(async () => {
    if (testOrderIds.length) {
      await pool.execute(`DELETE FROM orders WHERE id IN (${testOrderIds.map(() => '?').join(',')})`, testOrderIds);
    }
    if (testMenuItemId) await pool.execute('DELETE FROM menu_items WHERE id = ?', [testMenuItemId]);
    await pool.execute('DELETE FROM users WHERE email IN (?, ?, ?)', [customerEmail, otherEmail, adminEmail]);
    await pool.end();
    await new Promise(resolve => server.close(resolve));
  });

  const [schema] = await pool.execute(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND ((TABLE_NAME = 'orders' AND COLUMN_NAME IN ('status', 'cancelled_at'))
         OR (TABLE_NAME = 'users' AND COLUMN_NAME = 'role'))`
  );
  const column = (table, name) => schema.find(row => row.TABLE_NAME === table && row.COLUMN_NAME === name);
  assert.match(column('orders', 'status')?.COLUMN_TYPE || '', /enum\('pending','completed'\)/i, 'Apply the two-role order workflow migration before running integration tests');
  assert.match(column('orders', 'cancelled_at')?.COLUMN_TYPE || '', /timestamp/i, 'Apply the two-role order workflow migration before running integration tests');
  assert.match(column('users', 'role')?.COLUMN_TYPE || '', /enum\('CUSTOMER','ADMIN'\)/i, 'Apply the two-role order workflow migration before running integration tests');

  const health = await request(baseUrl, '/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.data.database, 'connected');

  const menuList = await request(baseUrl, '/menu-items');
  assert.equal(menuList.status, 200);
  assert.ok(menuList.data.data.length > 0);
  const menuItem = menuList.data.data[0];
  const menuDetail = await request(baseUrl, `/menu-items/${menuItem.id}`);
  assert.equal(menuDetail.status, 200);

  const registered = await request(baseUrl, '/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      full_name: 'Flow Customer',
      email: customerEmail,
      phone: '1111111111',
      password: customerPassword,
      role: 'ADMIN'
    })
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.data.role, USER_ROLES.CUSTOMER, 'Public registration must ignore submitted role');

  const customerLogin = await login(baseUrl, customerEmail, customerPassword);
  assert.equal(customerLogin.user.role, USER_ROLES.CUSTOMER);
  const customerToken = customerLogin.token;
  const customerMe = await request(baseUrl, '/auth/me', { headers: { Authorization: `Bearer ${customerToken}` } });
  assert.equal(customerMe.status, 200);
  assert.equal(customerMe.data.data.email, customerEmail);
  assert.equal(customerMe.data.data.role, USER_ROLES.CUSTOMER);

  const otherId = await seedUser({ name: 'Other Customer', email: otherEmail, password: customerPassword, role: USER_ROLES.CUSTOMER });
  const otherToken = (await login(baseUrl, otherEmail, customerPassword)).token;
  const adminId = await seedUser({ name: 'Flow Admin', email: adminEmail, password: adminPassword, role: USER_ROLES.ADMIN });
  const adminLogin = await login(baseUrl, adminEmail, adminPassword);
  assert.equal(adminLogin.user.role, USER_ROLES.ADMIN);
  const adminToken = adminLogin.token;

  const createOrder = async (token, payment = 'upi') => {
    const response = await request(baseUrl, '/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ payment_method: payment, items: [{ menu_item_id: menuItem.id, quantity: 1 }] })
    });
    assert.equal(response.status, 201);
    testOrderIds.push(response.data.data.id);
    return response.data.data;
  };

  const customerOrder = await createOrder(customerToken);
  assert.equal(customerOrder.status, 'pending');
  assert.equal(customerOrder.cancelled_at, null);

  const ownOrders = await request(baseUrl, '/orders', { headers: { Authorization: `Bearer ${customerToken}` } });
  assert.equal(ownOrders.status, 200);
  assert.ok(ownOrders.data.data.some(order => order.id === customerOrder.id));
  const otherCustomerAccess = await request(baseUrl, `/orders/${customerOrder.id}`, {
    headers: { Authorization: `Bearer ${otherToken}` }
  });
  assert.equal(otherCustomerAccess.status, 404);
  assert.ok(Number.isInteger(otherId));

  const customerStatusAttempt = await request(baseUrl, `/orders/${customerOrder.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(customerStatusAttempt.status, 403);

  const missingToken = await request(baseUrl, `/orders/${customerOrder.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(missingToken.status, 401);
  const invalidToken = await request(baseUrl, `/orders/${customerOrder.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer invalid.token.value' },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(invalidToken.status, 401);
  const expiredToken = jwt.sign({ sub: String(adminId) }, process.env.JWT_SECRET, { expiresIn: '-1s', issuer: 'udupi-hotel-api' });
  const expiredResponse = await request(baseUrl, `/orders/${customerOrder.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${expiredToken}` },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(expiredResponse.status, 401);

  const unknownOrder = await request(baseUrl, '/orders/999999999/status', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(unknownOrder.status, 404);

  const completed = await request(baseUrl, `/orders/${customerOrder.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.data.status, 'completed');

  for (const status of ['pending', 'preparing', 'confirmed']) {
    const invalidTransition = await request(baseUrl, `/orders/${customerOrder.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status })
    });
    assert.equal(invalidTransition.status, 409, `Completed order must reject ${status}`);
  }

  const cancelledOrder = await createOrder(customerToken, 'cash');
  const cancelled = await request(baseUrl, `/orders/${cancelledOrder.id}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.data.status, 'pending', 'Cancellation must not create a third status');
  assert.ok(cancelled.data.data.cancelled_at);

  const cancelledCompletion = await request(baseUrl, `/orders/${cancelledOrder.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(cancelledCompletion.status, 409);
  const cancelledFilter = await request(baseUrl, '/orders?status=cancelled', {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  assert.ok(cancelledFilter.data.data.some(order => order.id === cancelledOrder.id));

  const adminCancelledOrder = await createOrder(customerToken, 'card');
  const anotherCustomerCancel = await request(baseUrl, `/orders/${adminCancelledOrder.id}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${otherToken}` }
  });
  assert.equal(anotherCustomerCancel.status, 404);
  const adminCancellation = await request(baseUrl, `/orders/${adminCancelledOrder.id}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminCancellation.status, 200);
  assert.ok(adminCancellation.data.data.cancelled_at);

  const completedCancellation = await request(baseUrl, `/orders/${customerOrder.id}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  assert.equal(completedCancellation.status, 409);

  const adminOrders = await request(baseUrl, '/orders', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.ok(adminOrders.data.data.some(order => order.id === customerOrder.id));
  const customerReport = await request(baseUrl, '/reports/daily-sales', {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  assert.equal(customerReport.status, 403);
  const adminReport = await request(baseUrl, '/reports/daily-sales', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminReport.status, 200);
  const topSelling = await request(baseUrl, '/reports/top-selling-items', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(topSelling.status, 200);

  const customerMenuCreate = await request(baseUrl, '/menu-items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ name: `Test item ${suffix}`, category: 'Test', price: 1 })
  });
  assert.equal(customerMenuCreate.status, 403);
  const adminMenuCreate = await request(baseUrl, '/menu-items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: `Test item ${suffix}`, category: 'Test', price: 1 })
  });
  assert.equal(adminMenuCreate.status, 201);
  testMenuItemId = adminMenuCreate.data.data.id;
  const adminMenuUpdate = await request(baseUrl, `/menu-items/${testMenuItemId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ price: 2 })
  });
  assert.equal(adminMenuUpdate.status, 200);
  assert.equal(adminMenuUpdate.data.data.price, '2.00');
  const adminAvailability = await request(baseUrl, `/menu-items/${testMenuItemId}/availability`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ is_available: false })
  });
  assert.equal(adminAvailability.status, 200);
});
