import { ensureSchema, getPool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; unit?: string; quantity?: number; reorderLevel?: number };
    const name = body.name?.trim();
    const unit = body.unit?.trim();
    const quantity = Number(body.quantity);
    const reorder = Number(body.reorderLevel);
    if (!name || name.length > 120 || !unit || unit.length > 30 || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(reorder) || reorder < 0) {
      return Response.json({ error: 'Enter valid inventory details and nonnegative quantities.' }, { status: 400 });
    }
    await ensureSchema();
    const db = getPool();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO cafe_inventory_items (name, unit, quantity, reorder_level) VALUES (?, ?, ?, ?)', [name, unit, quantity, reorder],
      );
      if (quantity > 0) await connection.execute('INSERT INTO cafe_stock_movements (inventory_item_id, delta, reason) VALUES (?, ?, ?)', [result.insertId, quantity, 'Opening balance']);
      await connection.commit();
      return Response.json({ id: result.insertId }, { status: 201 });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') return Response.json({ error: 'This inventory item already exists.' }, { status: 409 });
    return Response.json({ error: 'Unable to add inventory item.' }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: number; delta?: number; reason?: string };
    const id = Number(body.id);
    const delta = Number(body.delta);
    const reason = body.reason?.trim();
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(delta) || delta === 0 || !reason || reason.length > 160) {
      return Response.json({ error: 'Enter a nonzero adjustment and reason.' }, { status: 400 });
    }
    await ensureSchema();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>('SELECT quantity FROM cafe_inventory_items WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) { await connection.rollback(); return Response.json({ error: 'Inventory item not found.' }, { status: 404 }); }
      if (Number(rows[0].quantity) + delta < 0) { await connection.rollback(); return Response.json({ error: 'Adjustment would make stock negative.' }, { status: 409 }); }
      await connection.execute('UPDATE cafe_inventory_items SET quantity = quantity + ? WHERE id = ?', [delta, id]);
      await connection.execute('INSERT INTO cafe_stock_movements (inventory_item_id, delta, reason) VALUES (?, ?, ?)', [id, delta, reason]);
      await connection.commit();
      return Response.json({ updated: true });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch {
    return Response.json({ error: 'Unable to adjust stock.' }, { status: 503 });
  }
}
