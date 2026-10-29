-- MANUAL MIGRATION: review the preview counts before running against an existing database.
-- Preserves all rows and order items. Legacy STAFF accounts become CUSTOMER, never ADMIN.
-- Legacy cancelled orders keep their cancellation timestamp in cancelled_at.
-- Legacy confirmed/preparing/ready orders were unfinished; they become pending, not completed.
-- Run once against an existing udupi_hotel database after taking a backup.

USE udupi_hotel;

SELECT role, COUNT(*) AS account_count FROM users GROUP BY role;
SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status;

SET @column_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancelled_at'
);
SET @column_sql := IF(@column_exists = 0,
  'ALTER TABLE orders ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1');
PREPARE cancelled_column_stmt FROM @column_sql;
EXECUTE cancelled_column_stmt;
DEALLOCATE PREPARE cancelled_column_stmt;

UPDATE orders
SET cancelled_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP), status = 'pending'
WHERE status = 'cancelled';
UPDATE orders SET status = 'pending' WHERE status IN ('confirmed', 'preparing', 'ready');
UPDATE users SET role = 'CUSTOMER' WHERE role = 'STAFF';

ALTER TABLE users MODIFY role ENUM('CUSTOMER','ADMIN') NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE orders MODIFY status ENUM('pending','completed') NOT NULL DEFAULT 'pending';

SET @index_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_cancelled_at'
);
SET @index_sql := IF(@index_exists = 0,
  'ALTER TABLE orders ADD INDEX idx_orders_cancelled_at (cancelled_at)',
  'SELECT 1');
PREPARE cancelled_index_stmt FROM @index_sql;
EXECUTE cancelled_index_stmt;
DEALLOCATE PREPARE cancelled_index_stmt;

SELECT role, COUNT(*) AS account_count FROM users GROUP BY role;
SELECT status, cancelled_at IS NOT NULL AS is_cancelled, COUNT(*) AS order_count
FROM orders
GROUP BY status, is_cancelled;
