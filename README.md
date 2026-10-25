# Bean & Board Cafe OS

A minimal cafe point-of-sale and operations dashboard built with Next.js, React, and MySQL. Menu items, orders, order statuses, sales totals, and popular items are read from the configured database. The app does not include browser-side sample records.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Connect local MySQL

Create the database once in MySQL:

```sql
CREATE DATABASE cafe_management;
```

Add your local connection string to `.env` and restart the development server:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/cafe_management"
```

The app creates the database tables when it first connects. It does not add records automatically. If the database is empty, the dashboard shows empty states.

## Seed the menu with Python

Edit `MENU_ITEMS` in `seed.py` to match your cafe, then run:

```powershell
python -m pip install -r requirements.txt
python seed.py
```

The script reads `DATABASE_URL` from `.env`, creates the schema if needed, and inserts menu items that are missing and adds image references for the included catalog where they are blank. It does not create sample orders, sales, customers, or other business history. Existing names, categories, prices, and availability are preserved.

## Main files

- `app/page.tsx` — database-driven cafe dashboard and point-of-sale UI
- `app/api/dashboard/route.ts` — database reads for menu, orders, and metrics
- `app/api/orders/route.ts` — order creation and status updates
- `lib/db.ts` — MySQL pool and schema setup
- `seed.py` — explicit menu catalog and product image reference seeding
- `public/products/cafe-menu-sheet.png` — generated cafe product photography
- `requirements.txt` — Python MySQL driver
- `.env` — local connection string placeholder (ignored by Git)


