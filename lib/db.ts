import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

const globalForMysql = globalThis as typeof globalThis & { cafePool?: mysql.Pool };

export function getPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  if (!globalForMysql.cafePool) globalForMysql.cafePool = mysql.createPool(connectionString);
  return globalForMysql.cafePool;
}

let schemaReady: Promise<void> | undefined;
export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool();
      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_products (
        id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(120) NOT NULL, category VARCHAR(60) NOT NULL,
        price DECIMAL(10,2) NOT NULL, image_url VARCHAR(255) NULL, available BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      const [imageColumns] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM cafe_products LIKE 'image_url'");
      if (imageColumns.length === 0) await db.execute('ALTER TABLE cafe_products ADD COLUMN image_url VARCHAR(255) NULL');

      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_tables (
        id INT PRIMARY KEY AUTO_INCREMENT, label VARCHAR(80) NOT NULL UNIQUE,
        seats INT NOT NULL DEFAULT 2, status ENUM('Available','Occupied') NOT NULL DEFAULT 'Available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_orders (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, table_id INT NULL,
        table_name VARCHAR(80) NOT NULL,
        status ENUM('Preparing','Ready','Served') NOT NULL DEFAULT 'Preparing',
        total DECIMAL(10,2) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_cafe_order_table FOREIGN KEY (table_id) REFERENCES cafe_tables(id) ON DELETE SET NULL
      )`);
      const [tableColumns] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM cafe_orders LIKE 'table_id'");
      if (tableColumns.length === 0) {
        await db.execute('ALTER TABLE cafe_orders ADD COLUMN table_id INT NULL');
        await db.execute('ALTER TABLE cafe_orders ADD CONSTRAINT fk_cafe_order_table FOREIGN KEY (table_id) REFERENCES cafe_tables(id) ON DELETE SET NULL');
      }
      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_order_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
        product_id INT NOT NULL, product_name VARCHAR(120) NOT NULL,
        quantity INT NOT NULL, unit_price DECIMAL(10,2) NOT NULL,
        CONSTRAINT fk_cafe_order_items_order FOREIGN KEY (order_id) REFERENCES cafe_orders(id) ON DELETE CASCADE
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_inventory_items (
        id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(120) NOT NULL UNIQUE,
        unit VARCHAR(30) NOT NULL, quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
        reorder_level DECIMAL(12,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_stock_movements (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, inventory_item_id INT NOT NULL,
        delta DECIMAL(12,2) NOT NULL, reason VARCHAR(160) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_cafe_stock_item FOREIGN KEY (inventory_item_id) REFERENCES cafe_inventory_items(id) ON DELETE CASCADE
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_payments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL UNIQUE,
        amount DECIMAL(10,2) NOT NULL, method ENUM('Cash','Card','UPI') NOT NULL,
        paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_cafe_payment_order FOREIGN KEY (order_id) REFERENCES cafe_orders(id) ON DELETE CASCADE
      )`);
    })().catch((error) => { schemaReady = undefined; throw error; });
  }
  await schemaReady;
}
