import mysql from 'mysql2/promise';

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
      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_orders (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, table_name VARCHAR(80) NOT NULL,
        status ENUM('Preparing','Ready','Served') NOT NULL DEFAULT 'Preparing',
        total DECIMAL(10,2) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS cafe_order_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
        product_id INT NOT NULL, product_name VARCHAR(120) NOT NULL,
        quantity INT NOT NULL, unit_price DECIMAL(10,2) NOT NULL,
        CONSTRAINT fk_cafe_order_items_order FOREIGN KEY (order_id) REFERENCES cafe_orders(id) ON DELETE CASCADE
      )`);
    })().catch((error) => { schemaReady = undefined; throw error; });
  }
  await schemaReady;
}

