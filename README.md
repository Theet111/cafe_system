# Bean and Board Cafe Management System

A Next.js 16 and MySQL cafe operations application. The interface reads all business records from MySQL. An empty database displays empty states until records are added through the application or the Python menu seeder.

## Run locally

```powershell
npm install
npm run dev
```

Open http://localhost:3000.

## Connect MySQL

Create the database once:

```sql
CREATE DATABASE cafe_management;
```

Set the connection string in `.env` and restart the development server:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/cafe_management"
```

The server creates or migrates the application tables when it connects. The connection string stays server side.

## Seed the menu

Edit `MENU_ITEMS` in `seed.py`, then run:

```powershell
python -m pip install -r requirements.txt
python seed.py
```

The script creates the seven application tables, inserts missing menu products, and fills blank image references for the included catalog. It does not create order, payment, inventory, or sales history. Add tables and inventory through the application.

## Core workflows

- **Orders:** choose an available table or takeaway, add menu products, save a transactional order, then advance its status from Preparing to Ready to Served. The selected table becomes occupied when the order is created and available when its last active order is served.
- **Payments:** record a single Cash, Card, or UPI payment for an order. Paid sales are calculated from payment records.
- **Products:** add and edit menu products, prices, categories, local image paths, and availability. Existing order lines retain the product name and unit price from the time of sale.
- **Tables:** add tables with a seat count and manage availability.
- **Inventory:** add ingredients or supplies, set reorder levels, adjust quantities, and review stock movement history. Negative stock is rejected.
- **Reports:** review paid sales, order counts, average order value, low stock, and popular products from MySQL.

## Database tables

| Table | Purpose |
|---|---|
| `cafe_products` | Menu catalog and availability |
| `cafe_tables` | Seating capacity and current status |
| `cafe_orders` | Order header, table link, status, and total |
| `cafe_order_items` | Order line snapshots |
| `cafe_payments` | One payment per order |
| `cafe_inventory_items` | Current stock and reorder levels |
| `cafe_stock_movements` | Inventory adjustment history |

`lib/db.ts` contains schema creation and migration. The API routes in `app/api` validate requests and execute parameterized MySQL statements. Order creation, payment recording, and stock adjustments use database transactions.

## Key files

- `app/page.tsx` — management dashboard and workflows
- `app/api/dashboard/route.ts` — database reads and metrics
- `app/api/orders/route.ts` — order creation and status changes
- `app/api/products/route.ts` — product management
- `app/api/tables/route.ts` — table management
- `app/api/inventory/route.ts` — stock and movement management
- `app/api/payments/route.ts` — payment recording
- `seed.py` — Python schema and menu seeder
- `public/products/cafe-menu-sheet.png` — local product photography
