import { ensureSchema, getPool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { orderId?: string | number; method?: string };
    const orderId = Number(String(body.orderId ?? '').replace(/^#/, ''));
    if (!Number.isSafeInteger(orderId) || orderId < 1 || !['Cash', 'Card', 'UPI'].includes(body.method ?? '')) {
      return Response.json({ error: 'Choose a valid order and payment method.' }, { status: 400 });
    }
    await ensureSchema();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [orders] = await connection.query<RowDataPacket[]>('SELECT total FROM cafe_orders WHERE id = ? FOR UPDATE', [orderId]);
      if (!orders.length) { await connection.rollback(); return Response.json({ error: 'Order not found.' }, { status: 404 }); }
      const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM cafe_payments WHERE order_id = ? LIMIT 1', [orderId]);
      if (existing.length) { await connection.rollback(); return Response.json({ error: 'Order is already paid.' }, { status: 409 }); }
      const [result] = await connection.execute<ResultSetHeader>('INSERT INTO cafe_payments (order_id, amount, method) VALUES (?, ?, ?)', [orderId, orders[0].total, body.method!]);
      await connection.commit();
      return Response.json({ id: result.insertId, amount: Number(orders[0].total) }, { status: 201 });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch {
    return Response.json({ error: 'Unable to record payment.' }, { status: 503 });
  }
}

