const router = require('express').Router();
const { body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const pool = require('../config/db');
const { toPaise, fromPaise } = require('../utils/money');
const { USER_ROLES, normalizeEmail, sanitizeUser, hashPassword, verifyPassword, signAccessToken } = require('../utils/auth');

const idRule = param('id').isInt({ min: 1 }).withMessage('id must be a positive integer');
const pagination = [query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 })];
const menuFields = [body('name').isString().trim().isLength({ min: 1, max: 120 }), body('description').optional({ nullable: true }).isString(), body('category').isString().trim().isLength({ min: 1, max: 80 }), body('price').isDecimal({ decimal_digits: '0,2' }).custom(v => Number(v) > 0)];
const strictBoolean = field => body(field).custom(value => typeof value === 'boolean').withMessage(`${field} must be a JSON boolean`);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many authentication attempts. Please try again later.', details: [] } },
  statusCode: 429
});

router.get('/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  single(res, { status: 'ok', database: 'connected' });
}));

router.post('/auth/register', [authLimiter, body('full_name').trim().isString().isLength({ min: 1, max: 120 }).withMessage('full_name is required'), body('email').trim().isEmail().isLength({ min: 3, max: 255 }).withMessage('email must be a valid email address'), body('phone').trim().isString().isLength({ min: 5, max: 20 }).withMessage('phone is required'), body('password').isString().isLength({ min: 8, max: 72 }).withMessage('password must be at least 8 characters long'), validate], asyncHandler(async (req, res) => {
  const fullName = String(req.body.full_name).trim();
  const email = normalizeEmail(req.body.email);
  const phone = String(req.body.phone).trim();
  const password = String(req.body.password);

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) throw httpError(409, 'EMAIL_IN_USE', 'An account with that email already exists');

  const passwordHash = await hashPassword(password);
  const [result] = await pool.execute('INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)', [fullName, email, phone, passwordHash, USER_ROLES.CUSTOMER]);
  const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
  single(res, sanitizeUser(users[0]), 201);
}));

router.post('/auth/login', [authLimiter, body('email').trim().isEmail().withMessage('email must be a valid email address'), body('password').isString().isLength({ min: 8 }).withMessage('password must be at least 8 characters long'), validate], asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  if (!rows.length) throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  const user = rows[0];
  const valid = await verifyPassword(String(req.body.password), user.password_hash);
  if (!valid) throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  const token = signAccessToken(user.id);
  single(res, { token, user: sanitizeUser(user) });
}));

router.get('/auth/me', [authenticate], asyncHandler(async (req, res) => {
  single(res, req.user);
}));

router.get('/menu-items', [...pagination, query('search').optional().isString(), query('category').optional().isString(), query('available').optional().isIn(['true', 'false']), validate], asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20), offset = (page - 1) * limit;
  const where = [], args = [];
  if (req.query.search) { where.push('(name LIKE ? OR description LIKE ?)'); args.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  if (req.query.category) { where.push('category = ?'); args.push(req.query.category); }
  if (req.query.available !== undefined) { where.push('is_available = ?'); args.push(req.query.available === 'true'); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM menu_items ${clause}`, args);
  const [rows] = await pool.query(`SELECT * FROM menu_items ${clause} ORDER BY category, name LIMIT ? OFFSET ?`, [...args, limit, offset]);
  collection(res, rows, page, limit, Number(count.total));
}));

router.get('/menu-items/:id', [idRule, validate], asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found');
  single(res, rows[0]);
}));

router.post('/menu-items', [authenticate, authorize(USER_ROLES.ADMIN), ...menuFields, strictBoolean('is_available').optional(), validate], asyncHandler(async (req, res) => {
  const { name, description = null, category, price, is_available = true } = req.body;
  const [result] = await pool.execute('INSERT INTO menu_items (name, description, category, price, is_available) VALUES (?, ?, ?, ?, ?)', [name, description, category, Number(price).toFixed(2), is_available === undefined ? true : is_available]);
  const [rows] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
  single(res, rows[0], 201);
}));

router.patch('/menu-items/:id', [authenticate, authorize(USER_ROLES.ADMIN), idRule, body().isObject(), body('name').optional().isString().trim().isLength({ min: 1, max: 120 }), body('description').optional({ nullable: true }).isString(), body('category').optional().isString().trim().isLength({ min: 1, max: 80 }), body('price').optional().isDecimal({ decimal_digits: '0,2' }).custom(v => Number(v) > 0), strictBoolean('is_available').optional(), validate], asyncHandler(async (req, res) => {
  const allowed = ['name', 'description', 'category', 'price', 'is_available'];
  const fields = allowed.filter(k => Object.hasOwn(req.body, k));
  if (!fields.length) throw httpError(400, 'EMPTY_UPDATE', 'Provide at least one menu field to update');
  const values = fields.map(k => k === 'price' ? Number(req.body[k]).toFixed(2) : req.body[k]);
  await pool.execute(`UPDATE menu_items SET ${fields.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...values, req.params.id]);
  const [rows] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found');
  single(res, rows[0]);
}));

router.patch('/menu-items/:id/availability', [authenticate, authorize(USER_ROLES.ADMIN), idRule, strictBoolean('is_available'), validate], asyncHandler(async (req, res) => {
  await pool.execute('UPDATE menu_items SET is_available = ? WHERE id = ?', [req.body.is_available, req.params.id]);
  const [rows] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found');
  single(res, rows[0]);
}));

router.post('/orders', [authenticate, authorize(USER_ROLES.CUSTOMER), body('payment_method').isIn(['cash', 'upi', 'card']), body('items').isArray({ min: 1 }), body('items.*.menu_item_id').isInt({ min: 1 }), body('items.*.quantity').isInt({ min: 1, max: 999 }), validate], asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const quantities = new Map();
    for (const item of req.body.items) quantities.set(Number(item.menu_item_id), (quantities.get(Number(item.menu_item_id)) || 0) + Number(item.quantity));
    const ids = [...quantities.keys()].sort((a, b) => a - b);
    const marks = ids.map(() => '?').join(',');
    const [menu] = await conn.execute(`SELECT id, name, price, is_available FROM menu_items WHERE id IN (${marks}) ORDER BY id FOR UPDATE`, ids);
    if (menu.length !== ids.length) throw httpError(400, 'INVALID_MENU_ITEM', 'One or more menu items do not exist');
    const byId = new Map(menu.map(row => [Number(row.id), row]));
    let totalPaise = 0;
    const lines = ids.map(id => {
      const item = byId.get(id);
      if (!item.is_available) throw httpError(409, 'ITEM_UNAVAILABLE', `${item.name} is unavailable`);
      const unit = toPaise(item.price);
      const subtotal = unit * quantities.get(id);
      totalPaise += subtotal;
      return { id, name: item.name, unit, quantity: quantities.get(id), subtotal };
    });

    const [order] = await conn.execute('INSERT INTO orders (user_id, customer_name, phone, payment_method, total_amount) VALUES (?, ?, ?, ?, ?)', [req.user.id, req.user.full_name, req.user.phone, req.body.payment_method, fromPaise(totalPaise)]);
    for (const line of lines) {
      await conn.execute('INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)', [order.insertId, line.id, line.name, fromPaise(line.unit), line.quantity, fromPaise(line.subtotal)]);
    }
    await conn.commit();
    const [orders] = await pool.execute('SELECT * FROM orders WHERE id = ?', [order.insertId]);
    const [orderItems] = await pool.execute('SELECT * FROM order_items WHERE order_id = ?', [order.insertId]);
    single(res, { ...orders[0], items: orderItems }, 201);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

router.get('/orders', [authenticate, ...pagination, query('status').optional().isIn(['pending','completed','cancelled']), validate], asyncHandler(async (req, res) => {
  if (![USER_ROLES.CUSTOMER, USER_ROLES.ADMIN].includes(req.user.role)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to view orders');
  }
  const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20), offset = (page - 1) * limit;
  const isCustomer = req.user.role === USER_ROLES.CUSTOMER;
  let where = '';
  const args = [];

  if (isCustomer) {
    where = 'WHERE user_id = ?';
    args.push(req.user.id);
  }

  if (req.query.status === 'cancelled') {
    where += where ? ' AND cancelled_at IS NOT NULL' : 'WHERE cancelled_at IS NOT NULL';
  } else if (req.query.status) {
    where += where ? ' AND status = ? AND cancelled_at IS NULL' : 'WHERE status = ? AND cancelled_at IS NULL';
    args.push(req.query.status);
  }

  const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM orders ${where}`, args);
  const [rows] = await pool.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  collection(res, rows, page, limit, Number(count.total));
}));

router.get('/orders/:id', [authenticate, idRule, validate], asyncHandler(async (req, res) => {
  if (![USER_ROLES.CUSTOMER, USER_ROLES.ADMIN].includes(req.user.role)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to view orders');
  }
  const isCustomer = req.user.role === USER_ROLES.CUSTOMER;
  let queryText = 'SELECT * FROM orders WHERE id = ?';
  const params = [req.params.id];
  if (isCustomer) {
    queryText += ' AND user_id = ?';
    params.push(req.user.id);
  }

  const [orders] = await pool.execute(queryText, params);
  if (!orders.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found');
  const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
  single(res, { ...orders[0], items });
}));

router.patch('/orders/:id/status', [authenticate, authorize(USER_ROLES.ADMIN), idRule, body('status').isString().withMessage('status must be a string'), validate], asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT status, cancelled_at FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    if (req.body.status !== 'completed' || rows[0].status !== 'pending' || rows[0].cancelled_at) {
      throw httpError(409, 'INVALID_STATUS_TRANSITION', 'Only an active pending order can be marked completed');
    }
    await conn.execute("UPDATE orders SET status = 'completed' WHERE id = ?", [req.params.id]);
    await conn.commit();
    const [updated] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    single(res, updated[0]);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

router.patch('/orders/:id/cancel', [authenticate, idRule, validate], asyncHandler(async (req, res) => {
  if (![USER_ROLES.CUSTOMER, USER_ROLES.ADMIN].includes(req.user.role)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to cancel orders');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT status, user_id, cancelled_at FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    if (req.user.role === USER_ROLES.CUSTOMER && rows[0].user_id !== req.user.id) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    if (rows[0].status !== 'pending' || rows[0].cancelled_at) throw httpError(409, 'CANCELLATION_NOT_ALLOWED', 'Only an active pending order can be cancelled');
    await conn.execute('UPDATE orders SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    await conn.commit();
    const [updated] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    single(res, updated[0]);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

router.get('/reports/daily-sales', [authenticate, authorize(USER_ROLES.ADMIN), query('date').optional().isISO8601({ strict: true }).matches(/^\d{4}-\d{2}-\d{2}$/), validate], asyncHandler(async (req, res) => {
  const date = req.query.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [[row]] = await pool.execute("SELECT COUNT(*) AS order_count, COALESCE(SUM(total_amount), 0.00) AS total_sales FROM orders WHERE status = 'completed' AND cancelled_at IS NULL AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)", [date, date]);
  single(res, { date, completed_order_count: Number(row.order_count), total_sales: row.total_sales });
}));

router.get('/reports/top-selling-items', [authenticate, authorize(USER_ROLES.ADMIN), query('limit').optional().isInt({ min: 1, max: 100 }), query('from').optional().isISO8601({ strict: true }).matches(/^\d{4}-\d{2}-\d{2}$/), query('to').optional().isISO8601({ strict: true }).matches(/^\d{4}-\d{2}-\d{2}$/), validate], asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 10), conditions = ["o.status = 'completed'", 'o.cancelled_at IS NULL'], args = [];
  if (req.query.from) { conditions.push('o.created_at >= ?'); args.push(req.query.from); }
  if (req.query.to) { conditions.push('o.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); args.push(req.query.to); }
  const [rows] = await pool.query(`SELECT oi.menu_item_id, oi.item_name, SUM(oi.quantity) AS quantity_sold FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${conditions.join(' AND ')} GROUP BY oi.menu_item_id, oi.item_name ORDER BY quantity_sold DESC, oi.item_name LIMIT ?`, [...args, limit]);
  collection(res, rows, 1, limit, rows.length);
}));

module.exports = router;
