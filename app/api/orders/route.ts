import { ensureSchema, getPool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

type RequestedItem = { id: number; quantity: number };
type ProductRow = RowDataPacket & { id: number; name: string; price: string | number; available: number };
const statuses = ['Preparing', 'Ready', 'Served'] as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tableId?: number | null; items?: RequestedItem[] };
    const tableId = body.tableId == null ? null : Number(body.tableId);
    if ((tableId !== null && (!Number.isSafeInteger(tableId) || tableId < 1)) || !Array.isArray(body.items) || body.items.length === 0) {
      return Response.json({ error: 'Select an available table or takeaway and add an item.' }, { status: 400 });
    }
    if (body.items.some((item) => !Number.isSafeInteger(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)) {
      return Response.json({ error: 'Order items are invalid.' }, { status: 400 });
    }
    await ensureSchema();
    const db = getPool();
    const ids = [...new Set(body.items.map((item) => item.id))];
    const [products] = await db.query<ProductRow[]>(`SELECT id, name, price, available FROM cafe_products WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    if (products.length !== ids.length || products.some((product) => !product.available)) {
      return Response.json({ error: 'One or more menu items are unavailable.' }, { status: 409 });
    }
    const byId = new Map(products.map((product) => [product.id, product]));
    const total = body.items.reduce((sum, item) => sum + Number(byId.get(item.id)!.price) * item.quantity, 0);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      let tableName = 'Takeaway';
      if (tableId !== null) {
        const [tables] = await connection.query<RowDataPacket[]>('SELECT label, status FROM cafe_tables WHERE id = ? FOR UPDATE', [tableId]);
        if (!tables.length || tables[0].status !== 'Available') { await connection.rollback(); return Response.json({ error: 'Table is unavailable.' }, { status: 409 }); }
        tableName = String(tables[0].label);
      }
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO cafe_orders (table_id, table_name, total) VALUES (?, ?, ?)', [tableId, tableName, total],
      );
      for (const item of body.items) {
        const product = byId.get(item.id)!;
        await connection.execute('INSERT INTO cafe_order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
          [result.insertId, product.id, product.name, item.quantity, product.price]);
      }
      if (tableId !== null) await connection.execute("UPDATE cafe_tables SET status = 'Occupied' WHERE id = ?", [tableId]);
      await connection.commit();
      return Response.json({ id: result.insertId, status: 'Preparing', total }, { status: 201 });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) {
    const status = error instanceof Error && error.message.includes('DATABASE_URL') ? 503 : 500;
    return Response.json({ error: status === 503 ? 'Database is not configured.' : 'Unable to save order.' }, { status });
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
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [orders] = await connection.query<RowDataPacket[]>('SELECT table_id, status FROM cafe_orders WHERE id = ? FOR UPDATE', [id]);
      if (!orders.length) { await connection.rollback(); return Response.json({ error: 'Order not found.' }, { status: 404 }); }
      const currentStatus = String(orders[0].status);
      const currentIndex = statuses.indexOf(currentStatus as (typeof statuses)[number]);
      const nextIndex = statuses.indexOf(nextStatus);
      if (nextIndex !== currentIndex + 1) {
        await connection.rollback();
        return Response.json({ error: 'Advance the order to its next status.' }, { status: 409 });
      }
      await connection.execute('UPDATE cafe_orders SET status = ? WHERE id = ?', [nextStatus, id]);
      const tableId = orders[0].table_id as number | null;
      if (nextStatus === 'Served' && tableId !== null) {
        const [active] = await connection.query<RowDataPacket[]>("SELECT id FROM cafe_orders WHERE table_id = ? AND status <> 'Served' LIMIT 1", [tableId]);
        if (!active.length) await connection.execute("UPDATE cafe_tables SET status = 'Available' WHERE id = ?", [tableId]);
      }
      await connection.commit();
      return Response.json({ updated: true });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch {
    return Response.json({ error: 'Unable to update order.' }, { status: 503 });
  }
}
