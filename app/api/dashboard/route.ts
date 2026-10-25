import { ensureSchema, getPool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';


type MenuRow = RowDataPacket & { id: number; name: string; category: string; price: number | string; image_url: string | null; available: number };
type OrderRow = RowDataPacket & { id: number | string; table_name: string; status: string; total: number | string; created_at: Date; items: string | null };
type MetricRow = RowDataPacket & { sales: number | string | null; order_count: number | string; average: number | string | null; active: number | string };
type PopularRow = RowDataPacket & { name: string; category: string | null; image_url: string | null; quantity: number | string };

export async function GET() {
  try {
    await ensureSchema();
    const db = getPool();
    const [menuRows] = await db.query<MenuRow[]>('SELECT id, name, category, price, image_url, available FROM cafe_products ORDER BY category, name');
    const [orderRows] = await db.query<OrderRow[]>(`SELECT o.id, o.table_name, o.status, o.total, o.created_at,
      GROUP_CONCAT(CONCAT(oi.quantity, ' × ', oi.product_name) ORDER BY oi.id SEPARATOR ', ') AS items
      FROM cafe_orders o LEFT JOIN cafe_order_items oi ON oi.order_id = o.id
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT 8`);
    const [metricRows] = await db.query<MetricRow[]>(`SELECT
      COALESCE(SUM(CASE WHEN created_at >= CURDATE() THEN total ELSE 0 END), 0) AS sales,
      COALESCE(SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END), 0) AS order_count,
      COALESCE(AVG(CASE WHEN created_at >= CURDATE() THEN total END), 0) AS average,
      COALESCE(SUM(CASE WHEN status <> 'Served' THEN 1 ELSE 0 END), 0) AS active
      FROM cafe_orders`);
    const [popularRows] = await db.query<PopularRow[]>(`SELECT oi.product_name AS name, p.category, p.image_url,
      SUM(oi.quantity) AS quantity FROM cafe_order_items oi
      LEFT JOIN cafe_products p ON p.id = oi.product_id
      JOIN cafe_orders o ON o.id = oi.order_id
      WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY oi.product_id, oi.product_name, p.category, p.image_url ORDER BY quantity DESC LIMIT 3`);
    const metrics = metricRows[0];
    return Response.json({
      menu: menuRows.map((item) => ({ ...item, price: Number(item.price), imageUrl: item.image_url, available: Boolean(item.available) })),
      orders: orderRows.map((order) => ({
        id: `#${order.id}`, table: order.table_name, status: order.status,
        total: Number(order.total), items: order.items ?? 'No items',
        time: new Date(order.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
      })),
      metrics: {
        sales: Number(metrics.sales), orders: Number(metrics.order_count),
        average: Number(metrics.average), active: Number(metrics.active),
      },
      popular: popularRows.map((item) => ({ ...item, imageUrl: item.image_url, quantity: Number(item.quantity) })),
      database: 'connected',
    });
  } catch {
    return Response.json({ error: 'Database unavailable', database: 'disconnected' }, { status: 503 });
  }
}




