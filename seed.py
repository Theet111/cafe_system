from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import unquote, urlparse

import mysql.connector

# Edit this cafe catalog before seeding. No order or sales history is inserted.
# image_url stores the shared menu image sheet and the zero-based photo tile.
MENU_ITEMS = [
    ("Cappuccino", "Coffee", 145.00, "/products/cafe-menu-sheet.png#0"),
    ("Flat white", "Coffee", 160.00, "/products/cafe-menu-sheet.png#1"),
    ("Cold brew", "Coffee", 180.00, "/products/cafe-menu-sheet.png#2"),
    ("Matcha latte", "Tea", 195.00, "/products/cafe-menu-sheet.png#3"),
    ("Butter croissant", "Bakery", 120.00, "/products/cafe-menu-sheet.png#4"),
    ("Blueberry muffin", "Bakery", 135.00, "/products/cafe-menu-sheet.png#5"),
    ("Avocado toast", "Kitchen", 260.00, "/products/cafe-menu-sheet.png#6"),
    ("Berry pancakes", "Kitchen", 290.00, "/products/cafe-menu-sheet.png#7"),
]


def load_env_file(path: Path = Path(__file__).resolve().parent / ".env") -> None:
    """Load simple KEY=VALUE lines without requiring python-dotenv."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def mysql_config(connection_url: str) -> dict[str, object]:
    parsed = urlparse(connection_url)
    if parsed.scheme not in {"mysql", "mysql+mysqlconnector"}:
        raise ValueError("DATABASE_URL must use the mysql:// scheme")
    if not parsed.hostname or not parsed.path.strip("/"):
        raise ValueError("DATABASE_URL must include a host and database name")
    return {
        "host": parsed.hostname,
        "port": parsed.port or 3306,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "database": unquote(parsed.path.lstrip("/")),
        "autocommit": False,
    }


def seed_database() -> int:
    """Create the app schema and insert/update menu catalog images."""
    load_env_file()
    connection_url = os.environ.get("DATABASE_URL", "").strip()
    if not connection_url:
        raise RuntimeError("Set DATABASE_URL in .env before running the seed script.")

    connection = mysql.connector.connect(**mysql_config(connection_url))
    inserted = 0
    try:
        cursor = connection.cursor()
        cursor.execute("""CREATE TABLE IF NOT EXISTS cafe_products (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(120) NOT NULL,
            category VARCHAR(60) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            image_url VARCHAR(255) NULL,
            available BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        cursor.execute("""CREATE TABLE IF NOT EXISTS cafe_orders (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            table_name VARCHAR(80) NOT NULL,
            status ENUM('Preparing','Ready','Served') NOT NULL DEFAULT 'Preparing',
            total DECIMAL(10,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        cursor.execute("""CREATE TABLE IF NOT EXISTS cafe_order_items (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            order_id BIGINT UNSIGNED NOT NULL,
            product_id INT NOT NULL,
            product_name VARCHAR(120) NOT NULL,
            quantity INT NOT NULL,
            unit_price DECIMAL(10,2) NOT NULL,
            CONSTRAINT fk_cafe_order_items_order FOREIGN KEY (order_id)
                REFERENCES cafe_orders(id) ON DELETE CASCADE
        )""")

        # Migrate databases created before product photos were added.
        cursor.execute("ALTER TABLE cafe_products MODIFY id INT NOT NULL AUTO_INCREMENT")
        cursor.execute("SHOW COLUMNS FROM cafe_products LIKE 'image_url'")
        if cursor.fetchone() is None:
            cursor.execute("ALTER TABLE cafe_products ADD COLUMN image_url VARCHAR(255) NULL")

        cursor.executemany(
            """INSERT INTO cafe_products (name, category, price, image_url)
               SELECT %s, %s, %s, %s WHERE NOT EXISTS
               (SELECT 1 FROM cafe_products WHERE name = %s)""",
            [(name, category, price, image_url, name) for name, category, price, image_url in MENU_ITEMS],
        )
        inserted = cursor.rowcount
        cursor.executemany(
            """UPDATE cafe_products SET image_url = %s
               WHERE name = %s AND (image_url IS NULL OR image_url = '')""",
            [(image_url, name) for name, _, _, image_url in MENU_ITEMS],
        )
        connection.commit()
        cursor.close()
        return inserted
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        count = seed_database()
        print(f"Database ready. Added {count} menu item(s); no order or sales data was created.")
    except Exception as error:
        raise SystemExit(f"Seed failed: {error}") from error
