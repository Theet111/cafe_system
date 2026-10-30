import { ensureSchema, getPool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { label?: string; seats?: number };
    const label = body.label?.trim();
    const seats = Number(body.seats);
    if (!label || label.length > 80 || !Number.isInteger(seats) || seats < 1 || seats > 30) {
      return Response.json({ error: 'Enter a table label and a seat count from 1 to 30.' }, { status: 400 });
    }
    await ensureSchema();
    const [result] = await getPool().execute<ResultSetHeader>('INSERT INTO cafe_tables (label, seats) VALUES (?, ?)', [label, seats]);
    return Response.json({ id: result.insertId }, { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') return Response.json({ error: 'This table label already exists.' }, { status: 409 });
    return Response.json({ error: 'Unable to add table.' }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: number; status?: 'Available' | 'Occupied' };
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1 || !['Available', 'Occupied'].includes(body.status ?? '')) return Response.json({ error: 'Invalid table status.' }, { status: 400 });
    await ensureSchema();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [tables] = await connection.query<RowDataPacket[]>('SELECT id FROM cafe_tables WHERE id = ? FOR UPDATE', [id]);
      if (!tables.length) { await connection.rollback(); return Response.json({ error: 'Table not found.' }, { status: 404 }); }
      if (body.status === 'Available') {
        const [active] = await connection.query<RowDataPacket[]>("SELECT id FROM cafe_orders WHERE table_id = ? AND status <> 'Served' LIMIT 1", [id]);
        if (active.length) { await connection.rollback(); return Response.json({ error: 'Finish active orders before freeing this table.' }, { status: 409 }); }
      }
      await connection.execute<ResultSetHeader>('UPDATE cafe_tables SET status = ? WHERE id = ?', [body.status!, id]);
      await connection.commit();
      return Response.json({ updated: true });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch {
    return Response.json({ error: 'Unable to update table.' }, { status: 503 });
  }
}

