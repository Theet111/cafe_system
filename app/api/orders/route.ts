import { ensureSchema, getPool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

type RequestedItem = { id: number; quantity: number };
type ProductRow = RowDataPacket & { id: number; name: string; price: string | number; available: number };
const statuses = ['Preparing', 'Ready', 'Served'] as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { table?: string; items?: RequestedItem[] };
    if (!body.table?.trim() || !Array.isArray(body.items) || body.items.length === 0) {
      return Response.json({ error: 'Enter a table or order label and add at least one menu item.' }, { status: 400 });
    }
    if (body.items.some((item) => !Number.isInteger(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)) {
      return Response.json({ error: 'Order items are invalid.' }, { status: 400 });
    }

    await ensureSchema();
    const db = getPool();
    const ids = [...new Set(body.items.map((item) => item.id))];
    const [rows] = await db.query<ProductRow[]>(`SELECT id, name, price, available FROM cafe_products WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    if (rows.length !== ids.length || rows.some((row) => !row.available)) {
      return Response.json({ error: 'One or more menu items are unavailable.' }, { status: 409 });
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    const total = body.items.reduce((sum, item) => sum + Number(byId.get(item.id)!.price) * item.quantity, 0);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO cafe_orders (table_name, total) VALUES (?, ?)', [body.table.trim(), total],
      );
      for (const item of body.items) {
        const product = byId.get(item.id)!;
        await connection.execute(
          'INSERT INTO cafe_order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
          [result.insertId, product.id, product.name, item.quantity, product.price],
        );
      }
      await connection.commit();
      return Response.json({ id: result.insertId, status: 'Preparing', total }, { status: 201 });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save order.';
    const status = message.includes('DATABASE_URL') ? 503 : 500;
    return Response.json({ error: status === 503 ? 'Database is not configured.' : message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string | number; status?: string };
    const id = Number(String(body.id ?? '').replace(/^#/, ''));
    if (!Number.isSafeInteger(id) || id < 1 || !statuses.includes(body.status as (typeof statuses)[number])) {
      return Response.json({ error: 'A valid order and status are required.' }, { status: 400 });
    }
    const nextStatus = body.status as (typeof statuses)[number];
    await ensureSchema();
    const [result] = await getPool().execute<ResultSetHeader>(
      'UPDATE cafe_orders SET status = ? WHERE id = ?', [nextStatus, id],
    );
    if (result.affectedRows === 0) return Response.json({ error: 'Order not found.' }, { status: 404 });
    return Response.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update order.';
    const status = message.includes('DATABASE_URL') ? 503 : 500;
    return Response.json({ error: status === 503 ? 'Database is not configured.' : message }, { status });
  }
}




