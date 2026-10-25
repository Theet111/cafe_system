from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import unquote, urlparse

import mysql.connector

# Edit these catalog rows before running the script to match your cafe's menu.
# This seeds products only. It never creates sample orders, sales, or customers.
MENU_ITEMS = [
    ("Cappuccino", "Coffee", 145.00),
    ("Flat white", "Coffee", 160.00),
    ("Cold brew", "Coffee", 180.00),
    ("Matcha latte", "Tea", 195.00),
    ("Butter croissant", "Bakery", 120.00),
    ("Blueberry muffin", "Bakery", 135.00),
    ("Avocado toast", "Kitchen", 260.00),
    ("Berry pancakes", "Kitchen", 290.00),
]


def load_env_file(path: Path = Path(__file__).resolve().parent / ".env") -> None:
    """Load simple KEY=VALUE lines without requiring python-dotenv."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
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
    """Create the cafe schema and insert missing menu catalog items."""
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
        cursor.execute("ALTER TABLE cafe_products MODIFY id INT NOT NULL AUTO_INCREMENT")
        cursor.executemany(
            """INSERT INTO cafe_products (name, category, price) SELECT %s, %s, %s WHERE NOT EXISTS (SELECT 1 FROM cafe_products WHERE name = %s)""",
            [(name, category, price, name) for name, category, price in MENU_ITEMS],
        )
        inserted = cursor.rowcount
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




