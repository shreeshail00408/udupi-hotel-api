CREATE DATABASE IF NOT EXISTS udupi_hotel CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE udupi_hotel;

CREATE TABLE IF NOT EXISTS menu_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  category VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), INDEX idx_menu_category (category), INDEX idx_menu_available (is_available),
  CONSTRAINT chk_menu_price CHECK (price > 0)
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  payment_method ENUM('cash','upi','card') NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','completed') NOT NULL DEFAULT 'pending',
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), INDEX idx_orders_status_created (status, created_at), INDEX idx_orders_created (created_at), INDEX idx_orders_user_id (user_id), INDEX idx_orders_cancelled_at (cancelled_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_order_total CHECK (total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(120) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id), INDEX idx_order_items_menu (menu_item_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT,
  CONSTRAINT chk_item_price CHECK (unit_price > 0), CONSTRAINT chk_item_quantity CHECK (quantity > 0),
  CONSTRAINT chk_item_subtotal CHECK (subtotal > 0)
) ENGINE=InnoDB;

INSERT INTO menu_items (name, description, category, price)
SELECT seed.name, seed.description, seed.category, seed.price FROM (
  SELECT 'Masala Dosa' AS name, 'Crisp rice crepe with spiced potato, served with chutney and sambar.' AS description, 'Breakfast' AS category, 85.00 AS price
  UNION ALL SELECT 'Idli (2 pcs)', 'Steamed rice cakes with coconut chutney and sambar.', 'Breakfast', 50.00
  UNION ALL SELECT 'Paneer Butter Masala', 'Paneer in a creamy tomato gravy.', 'Main Course', 190.00
  UNION ALL SELECT 'Veg Biryani', 'Fragrant basmati rice with vegetables and raita.', 'Main Course', 160.00
  UNION ALL SELECT 'Filter Coffee', 'Traditional South Indian filter coffee.', 'Beverages', 35.00
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM menu_items existing WHERE existing.name = seed.name AND existing.category = seed.category
);
