const swaggerJsdoc = require('swagger-jsdoc');

const securityScheme = {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT access token issued by the auth endpoints.'
};

const errorResponse = {
  description: 'Validation, missing resource, conflict, forbidden, or server error',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      examples: {
        error: {
          value: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: [{ field: 'id', message: 'id must be a positive integer' }]
            }
          }
        }
      }
    }
  }
};
const responses = (successDescription, example, status = '200') => ({ [status]: { description: successDescription, content: { 'application/json': { schema: { $ref: '#/components/schemas/SingleResponse' }, examples: { success: { value: example } } } } }, '400': errorResponse, '401': errorResponse, '403': errorResponse, '404': errorResponse, '409': errorResponse, '500': errorResponse });
const pathId = { in: 'path', name: 'id', required: true, schema: { type: 'integer', minimum: 1 }, example: 1 };
const jsonBody = schema => ({ required: true, content: { 'application/json': { schema, example: schema.example } } });
const menu = { id: 1, name: 'Masala Dosa', description: 'Dosa with spiced potato', category: 'Breakfast', price: '85.00', is_available: true, created_at: '2026-10-26T08:00:00.000Z', updated_at: '2026-10-26T08:00:00.000Z' };
const order = { id: 1, user_id: 1, customer_name: 'Ananya Rao', phone: '9876543210', payment_method: 'upi', total_amount: '170.00', status: 'pending', cancelled_at: null, created_at: '2026-10-26T08:00:00.000Z', updated_at: '2026-10-26T08:00:00.000Z' };
const menuCreate = { type: 'object', required: ['name','category','price'], properties: { name: { type: 'string', maxLength: 120 }, description: { type: 'string', nullable: true }, category: { type: 'string', maxLength: 80 }, price: { type: 'number', exclusiveMinimum: 0 }, is_available: { type: 'boolean' } }, example: { name: 'Masala Dosa', description: 'Dosa with spiced potato', category: 'Breakfast', price: 85, is_available: true } };
const orderCreate = { type: 'object', required: ['payment_method','items'], properties: { payment_method: { type: 'string', enum: ['cash','upi','card'] }, items: { type: 'array', minItems: 1, items: { type: 'object', required: ['menu_item_id','quantity'], properties: { menu_item_id: { type: 'integer', minimum: 1 }, quantity: { type: 'integer', minimum: 1, maximum: 999 } } } } }, example: { payment_method: 'upi', items: [{ menu_item_id: 1, quantity: 2 }] } };
const customerRegistration = { type: 'object', required: ['full_name','email','phone','password'], properties: { full_name: { type: 'string', maxLength: 120 }, email: { type: 'string', format: 'email' }, phone: { type: 'string', minLength: 5, maxLength: 20 }, password: { type: 'string', minLength: 8, maxLength: 72 } }, example: { full_name: 'Ananya Rao', email: 'ananya@example.com', phone: '9876543210', password: 'StrongPass123!' } };
const authLogin = { type: 'object', required: ['email','password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 } }, example: { email: 'ananya@example.com', password: 'StrongPass123!' } };
const user = { id: 1, full_name: 'Ananya Rao', email: 'ananya@example.com', phone: '9876543210', role: 'CUSTOMER', created_at: '2026-10-26T08:00:00.000Z', updated_at: '2026-10-26T08:00:00.000Z' };

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Udupi Hotel API', version: '1.0.0', description: 'Restaurant ordering API with CUSTOMER and ADMIN roles. Both roles use the same login endpoint; only admins can manage orders, the menu, and reports.' },
    servers: [{ url: 'http://localhost:3000' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: securityScheme },
      schemas: {
        Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'object', properties: { code: { type: 'string', example: 'VALIDATION_ERROR' }, message: { type: 'string', example: 'Request validation failed' }, details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } } } } } },
        SingleResponse: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: { type: 'object', additionalProperties: true } } },
        CollectionResponse: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: { type: 'array', items: { type: 'object', additionalProperties: true } }, meta: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } } } },
        MenuItem: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, category: { type: 'string' }, price: { type: 'string', example: '85.00' }, is_available: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' } } },
        Order: { type: 'object', properties: { id: { type: 'integer' }, user_id: { type: 'integer', nullable: true }, customer_name: { type: 'string' }, phone: { type: 'string' }, payment_method: { type: 'string', enum: ['cash','upi','card'] }, total_amount: { type: 'string', example: '170.00' }, status: { type: 'string', enum: ['pending','completed'] }, cancelled_at: { type: 'string', format: 'date-time', nullable: true } } },
        User: { type: 'object', properties: { id: { type: 'integer' }, full_name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, role: { type: 'string', enum: ['CUSTOMER','ADMIN'] }, created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' } } }
      }
    },
    paths: {
      '/api/health': { get: { summary: 'Check application and database connectivity', security: [], responses: responses('Database is connected', { success: true, data: { status: 'ok', database: 'connected' } }) } },
      '/api/auth/register': { post: { summary: 'Register a customer account; submitted roles are ignored', security: [], requestBody: jsonBody(customerRegistration), responses: responses('Customer registered', { success: true, data: user }, '201') } },
      '/api/auth/login': { post: { summary: 'Sign in as a customer or admin and receive a JWT access token', security: [], requestBody: jsonBody(authLogin), responses: responses('JWT issued', { success: true, data: { token: 'jwt.access.token', user } }) } },
      '/api/auth/me': { get: { summary: 'Returns the authenticated user profile', security: [{ bearerAuth: [] }], responses: responses('Authenticated profile', { success: true, data: user }) } },
      '/api/menu-items': {
        get: { summary: 'List menu items with filters and pagination', security: [], parameters: [{ in: 'query', name: 'search', schema: { type: 'string' }, example: 'dosa' }, { in: 'query', name: 'category', schema: { type: 'string' }, example: 'Breakfast' }, { in: 'query', name: 'available', schema: { type: 'boolean' } }, { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 }, example: 1 }, { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 }, example: 20 }], responses: { '200': { description: 'Menu collection', content: { 'application/json': { schema: { $ref: '#/components/schemas/CollectionResponse' }, example: { success: true, data: [menu], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } }, '400': errorResponse, '500': errorResponse } },
        post: { summary: 'Create a menu item (admin only)', security: [{ bearerAuth: [] }], requestBody: jsonBody(menuCreate), responses: responses('Menu item created', { success: true, data: menu }, '201') }
      },
      '/api/menu-items/{id}': { parameters: [pathId], get: { summary: 'Retrieve one menu item', security: [], responses: responses('Menu item', { success: true, data: menu }) }, patch: { summary: 'Update supplied menu fields (admin only)', security: [{ bearerAuth: [] }], requestBody: jsonBody({ ...menuCreate, required: [], example: { price: 90 } }), responses: responses('Menu item updated', { success: true, data: menu }) } },
      '/api/menu-items/{id}/availability': { parameters: [pathId], patch: { summary: 'Set availability with a JSON boolean (admin only)', security: [{ bearerAuth: [] }], requestBody: jsonBody({ type: 'object', required: ['is_available'], properties: { is_available: { type: 'boolean' } }, example: { is_available: false } }), responses: responses('Availability updated', { success: true, data: menu }) } },
      '/api/orders': {
        get: { summary: 'Customers see their own orders; admins see every order', security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'status', schema: { type: 'string', enum: ['pending','completed','cancelled'] } }, { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } }, { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 } }], responses: { '200': { description: 'Order collection', content: { 'application/json': { schema: { $ref: '#/components/schemas/CollectionResponse' }, example: { success: true, data: [order], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } }, '400': errorResponse, '401': errorResponse, '403': errorResponse, '500': errorResponse } },
        post: { summary: 'Create an authenticated user order; customer identity comes from the JWT, not the body', security: [{ bearerAuth: [] }], requestBody: jsonBody(orderCreate), responses: responses('Order and item snapshots created', { success: true, data: { ...order, items: [{ id: 1, order_id: 1, menu_item_id: 1, item_name: 'Masala Dosa', unit_price: '85.00', quantity: 2, subtotal: '170.00' }] } }, '201') }
      },
      '/api/orders/{id}': { parameters: [pathId], get: { summary: 'Retrieve an order and item snapshots for the authenticated user', security: [{ bearerAuth: [] }], responses: responses('Order with items', { success: true, data: { ...order, items: [{ id: 1, menu_item_id: 1, item_name: 'Masala Dosa', unit_price: '85.00', quantity: 2, subtotal: '170.00' }] } }) } },
      '/api/orders/{id}/status': { parameters: [pathId], patch: { summary: 'Mark an active pending order completed (admin only)', security: [{ bearerAuth: [] }], requestBody: jsonBody({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['completed'] } }, example: { status: 'completed' } }), responses: { ...responses('Order status updated', { success: true, data: { ...order, status: 'completed' } }), '409': errorResponse } } },
      '/api/orders/{id}/cancel': { parameters: [pathId], patch: { summary: 'Cancel an active pending order; cancellation is stored separately from status', security: [{ bearerAuth: [] }], responses: { ...responses('Order cancelled', { success: true, data: { ...order, cancelled_at: '2026-10-26T08:30:00.000Z' } }), '409': errorResponse } } },
      '/api/reports/daily-sales': { get: { summary: 'Completed sales for a date (admin only)', security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'date', schema: { type: 'string', format: 'date' }, example: '2026-10-26' }], responses: responses('Daily sales summary', { success: true, data: { date: '2026-10-26', completed_order_count: 4, total_sales: '620.00' } }) } },
      '/api/reports/top-selling-items': { get: { summary: 'Rank item quantities from completed orders only (admin only)', security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 } }, { in: 'query', name: 'from', schema: { type: 'string', format: 'date' } }, { in: 'query', name: 'to', schema: { type: 'string', format: 'date' } }], responses: { '200': { description: 'Ranked completed-order items', content: { 'application/json': { schema: { $ref: '#/components/schemas/CollectionResponse' }, example: { success: true, data: [{ menu_item_id: 1, item_name: 'Masala Dosa', quantity_sold: '12' }], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } } } } }, '400': errorResponse, '500': errorResponse } } }
    }
  },
  apis: []
});
