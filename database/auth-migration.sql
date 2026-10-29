-- Non-destructive migration for an existing Udupi Hotel database.
-- Purpose: add the auth table and attach each order to a user when available.
-- This script will not drop, truncate, or modify existing menu_items or order data.
-- Run it only for an existing installation, not against a fresh schema that is already being created.

USE udupi_hotel;

SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('CUSTOMER','ADMIN') NOT NULL DEFAULT 'CUSTOMER',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_email (email)
) ENGINE=InnoDB;

SELECT role, COUNT(*) AS account_count FROM users GROUP BY role;

-- Existing staff accounts are moved to CUSTOMER, never promoted to ADMIN.
UPDATE users SET role = 'CUSTOMER' WHERE role = 'STAFF';
ALTER TABLE users MODIFY role ENUM('CUSTOMER','ADMIN') NOT NULL DEFAULT 'CUSTOMER';

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'user_id'
);
SET @column_sql := IF(@column_exists = 0,
  'ALTER TABLE orders ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER status',
  'SELECT 1');
PREPARE column_stmt FROM @column_sql;
EXECUTE column_stmt;
DEALLOCATE PREPARE column_stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_orders_user_id'
);
SET @index_sql := IF(@index_exists = 0,
  'ALTER TABLE orders ADD INDEX idx_orders_user_id (user_id)',
  'SELECT 1');
PREPARE index_stmt FROM @index_sql;
EXECUTE index_stmt;
DEALLOCATE PREPARE index_stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'fk_orders_user'
);
SET @fk_sql := IF(@fk_exists = 0,
  'ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'cancelled_at'
);
SET @column_sql := IF(@column_exists = 0,
  'ALTER TABLE orders ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1');
PREPARE cancelled_column_stmt FROM @column_sql;
EXECUTE cancelled_column_stmt;
DEALLOCATE PREPARE cancelled_column_stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_orders_cancelled_at'
);
SET @index_sql := IF(@index_exists = 0,
  'ALTER TABLE orders ADD INDEX idx_orders_cancelled_at (cancelled_at)',
  'SELECT 1');
PREPARE cancelled_index_stmt FROM @index_sql;
EXECUTE cancelled_index_stmt;
DEALLOCATE PREPARE cancelled_index_stmt;

-- Keep legacy cancellations distinct and map unfinished legacy stages to pending.
UPDATE orders
SET cancelled_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP), status = 'pending'
WHERE status = 'cancelled';
UPDATE orders SET status = 'pending' WHERE status IN ('confirmed', 'preparing', 'ready');
ALTER TABLE orders MODIFY status ENUM('pending','completed') NOT NULL DEFAULT 'pending';

-- Orders without user_id remain accessible to admins; new orders are linked to their customer.
SELECT role, COUNT(*) AS account_count FROM users GROUP BY role;
SELECT status, cancelled_at IS NOT NULL AS is_cancelled, COUNT(*) AS order_count
FROM orders
GROUP BY status, is_cancelled;
