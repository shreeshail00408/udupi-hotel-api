# Udupi Hotel Ordering API

A small Express + MySQL REST API for menu management, restaurant orders, and sales reporting. It uses CommonJS, mysql2/promise, JWT-based authentication, and two roles: customers and admins.

## Folder guide

- `src/server.js` starts the HTTP server; `src/app.js` wires middleware and routes.
- `src/config/db.js` creates the shared MySQL connection pool; `src/config/swagger.js` defines the OpenAPI page.
- `src/routes/index.js` contains the endpoint handlers together with SQL, validation, and auth checks.
- `src/middleware` holds request validation, JWT authentication, authorization, and central error handling.
- `src/utils/auth.js` centralizes password hashing, JWT creation, and user sanitization.
- `database/schema.sql` creates the tables for fresh installs and is safe for new projects.
- `database/auth-migration.sql` adds authentication to an older installation and applies the current role and order workflow.
- `database/two-role-order-workflow-migration.sql` updates an installation that already uses the previous authenticated schema.
- `scripts/create-admin.js` creates the initial admin account with a bcrypt-hashed password.
- `test/` contains the unit tests for the auth utilities and money conversion.

## Setup

Requirements: Node.js 18+ and MySQL 8.0.

1. Before changing an existing database, back it up and review migration preview counts. Do not run migration scripts on a fresh install.
2. For a fresh install, run `SOURCE /absolute/path/to/udupi-hotel-api/database/schema.sql;` from a MySQL client. This creates the database and the tables with the authentication model included.
3. For an older installation without auth tables, review the status/role counts printed by `database/auth-migration.sql`, then run it. It adds auth tables, preserves legacy cancellations as `cancelled_at`, maps unfinished intermediate statuses to `pending`, and changes any legacy `STAFF` accounts to `CUSTOMER`.
4. For an installation that already uses the previous authenticated schema, review and run `database/two-role-order-workflow-migration.sql`. It preserves orders, maps legacy cancellations to `cancelled_at`, maps unfinished statuses to `pending`, and changes legacy `STAFF` accounts to `CUSTOMER` without promoting them.
5. Copy `.env.example` to `.env`, then set the MySQL credentials and a strong `JWT_SECRET` value. Keep `.env` out of Git.
6. Run `npm ci`, then `npm run dev` or `npm start`.
7. Open `http://localhost:3000` to browse the menu, create a customer account, and place orders. Admins use the same sign-in form.
8. Check `GET http://localhost:3000/api/health` and open `http://localhost:3000/api-docs` for the Swagger UI.
9. Import `postman/Udupi-Hotel-API.postman_collection.json` into Postman. It includes auth requests and a `token` variable.

## Environment variables

Create a `.env` file from `.env.example` with values such as:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=udupi_app
DB_PASSWORD=replace_with_your_local_password
DB_NAME=udupi_hotel
JWT_SECRET=replace_with_a_long_random_secret_at_least_32_chars
ADMIN_EMAIL=admin@udupi.local
ADMIN_NAME=Restaurant Admin
ADMIN_PHONE=0000000000
ADMIN_PASSWORD=replace_with_a_strong_password_at_least_8_chars
# Set this temporarily to the current admin email when resetting an existing account.
ADMIN_RESET_EMAIL=
```

The JWT secret is required and must not be committed to source control.

## Creating the initial admin

Run the one-time helper:

```bash
npm run create-admin
```

This script creates the first `ADMIN` user in the `users` table using a bcrypt-hashed password. It does not expose a public admin-registration endpoint and should be used only in a trusted local environment.

To update the credentials of an existing admin, set `ADMIN_RESET_EMAIL` to that account's current email, then set `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PHONE`, and `ADMIN_PASSWORD` to the new values in `.env`. Run:

```bash
npm run reset-admin
```

The reset command updates only the matching existing `ADMIN`; it does not create or promote accounts. It refuses to proceed if the current email is not an admin or the new email belongs to another user. Afterward, remove `ADMIN_RESET_EMAIL` from `.env` and restart the app. Never share or commit `.env`.

## Authentication model

Roles:

- `CUSTOMER`: register, log in, view the public menu, place orders, and view only their own orders.
- `ADMIN`: log in through the same endpoint and sign-in form, view all orders, complete orders, manage menu items, and view sales reports.

Customer registration always creates a `CUSTOMER`; a submitted role is ignored. Use `npm run create-admin` for the initial admin. Protected requests reload the user from MySQL and check the stored role. There is no public admin-registration or staff-account creation endpoint.

## API contract

Success responses: `{ "success": true, "data": resource }`. Collection responses include `meta` with `page`, `limit`, `total`, and `totalPages`. Errors use `{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }`.

### Public endpoints

- `GET /api/health`
- `GET /api/menu-items`
- `GET /api/menu-items/:id`
- `POST /api/auth/register`
- `POST /api/auth/login`

### Authenticated customer endpoints

- `GET /api/auth/me`
- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/cancel`

### Admin-only endpoints

- `POST /api/menu-items`
- `PATCH /api/menu-items/:id`
- `PATCH /api/menu-items/:id/availability`
- `PATCH /api/orders/:id/status`
- `GET /api/reports/daily-sales`
- `GET /api/reports/top-selling-items`

## Example auth requests

### Register a customer

```http
POST /api/auth/register
Content-Type: application/json

{
  "full_name": "Ananya Rao",
  "email": "ananya@example.com",
  "phone": "9876543210",
  "password": "StrongPass123!"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "ananya@example.com",
  "password": "StrongPass123!"
}
```

### Authenticated order creation

```http
POST /api/orders
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "payment_method": "upi",
  "items": [{ "menu_item_id": 1, "quantity": 2 }, { "menu_item_id": 5, "quantity": 1 }]
}
```

The server stores the authenticated user's `full_name` and `phone` from the database for each new order. Clients should not send customer identity fields when creating orders.

## Order status and cancellation rules

- The two normal order statuses are `pending` and `completed`.
- Only an admin can change an active pending order directly to `completed`; completed orders cannot be reopened.
- Cancellation is separate from status and recorded in `cancelled_at`. A cancelled order retains `pending` status but is no longer an active pending order.
- Customers can cancel only their own active pending orders; admins can cancel any active pending order.
- Daily sales and top-selling summaries count completed, non-cancelled orders only.
- The frontend shows an Admin — Order Management section only to admins and provides a Mark Completed action. The backend independently enforces the role.

## Testing and demo

- Run `npm test` for the automated unit tests.
- For a manual verification, register a customer, log in, create an order, and confirm its status is `pending`. Confirm the customer cannot access another user's order or change status.
- Run `npm run create-admin`, sign in through the same website form using the admin credentials, and verify the Admin — Order Management section appears. Mark the order completed and confirm the refreshed status. A customer must receive `403` when attempting the same API update.
- Sign in as the admin and verify menu management and sales reports remain available.

## Migration notes

- For a fresh database, run the full schema file.
- For an older unauthenticated installation, review and run `database/auth-migration.sql`.
- For an installation already using the previous authenticated schema, back up the database, inspect preview counts, and manually run `sudo mysql < database/two-role-order-workflow-migration.sql` from the project folder.
- The migrations preserve orders and order items. Existing `STAFF` accounts become `CUSTOMER`, never `ADMIN`. Legacy cancelled orders retain cancellation via `cancelled_at`; `confirmed`, `preparing`, and `ready` orders become `pending` because those stages were unfinished. Completed orders remain completed.
- Migrations are manual and are never executed automatically when the server starts.
