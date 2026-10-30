import { ensureSchema, getPool } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

function validImage(value: unknown) {
  return value === null || value === '' || (typeof value === 'string' && value.startsWith('/products/') && !value.includes('..') && value.length <= 255);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; category?: string; price?: number; imageUrl?: string | null };
    const name = body.name?.trim();
    const category = body.category?.trim();
    const price = Number(body.price);
    if (!name || name.length > 120 || !category || category.length > 60 || !Number.isFinite(price) || price <= 0 || !validImage(body.imageUrl ?? null)) {
      return Response.json({ error: 'Enter a valid name, category, price, and local image path.' }, { status: 400 });
    }
    await ensureSchema();
    const [result] = await getPool().execute<ResultSetHeader>(
      'INSERT INTO cafe_products (name, category, price, image_url) VALUES (?, ?, ?, ?)',
      [name, category, price, body.imageUrl || null],
    );
    return Response.json({ id: result.insertId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message.includes('DATABASE_URL') ? 'Database is not configured.' : 'Unable to add product.' }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: number; name?: string; category?: string; price?: number; imageUrl?: string | null; available?: boolean };
    const id = Number(body.id);
    const name = body.name?.trim();
    const category = body.category?.trim();
    const price = Number(body.price);
    if (!Number.isSafeInteger(id) || id < 1 || !name || name.length > 120 || !category || category.length > 60 || !Number.isFinite(price) || price <= 0 || typeof body.available !== 'boolean' || !validImage(body.imageUrl ?? null)) {
      return Response.json({ error: 'Product details are invalid.' }, { status: 400 });
    }
    await ensureSchema();
    const [result] = await getPool().execute<ResultSetHeader>(
      'UPDATE cafe_products SET name = ?, category = ?, price = ?, image_url = ?, available = ? WHERE id = ?',
      [name, category, price, body.imageUrl || null, body.available, id],
    );
    if (!result.affectedRows) return Response.json({ error: 'Product not found.' }, { status: 404 });
    return Response.json({ updated: true });
  } catch {
    return Response.json({ error: 'Unable to update product.' }, { status: 503 });
  }
}
