import { ensureSchema, getPool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

type MenuRow = RowDataPacket & { id: number; name: string; category: string; price: number | string; image_url: string | null; available: number };
type OrderRow = RowDataPacket & { id: number | string; table_id: number | null; table_name: string; status: string; total: number | string; created_at: Date; payment_method: string | null; items: string | null };
type TableRow = RowDataPacket & { id: number; label: string; seats: number; status: string };
type InventoryRow = RowDataPacket & { id: number; name: string; unit: string; quantity: number | string; reorder_level: number | string };
type MetricRow = RowDataPacket & { sales: number | string | null; order_count: number | string; average: number | string | null; active: number | string };
type PopularRow = RowDataPacket & { name: string; category: string | null; image_url: string | null; quantity: number | string };
type MovementRow = RowDataPacket & { id: number; item_name: string; delta: number | string; unit: string; reason: string; created_at: Date };

export async function GET() {
  try {
    await ensureSchema();
    const db = getPool();
    const [menuRows] = await db.query<MenuRow[]>('SELECT id, name, category, price, image_url, available FROM cafe_products ORDER BY category, name');
    const [orderRows] = await db.query<OrderRow[]>(`SELECT o.id, o.table_id, o.table_name, o.status, o.total, o.created_at,
      p.method AS payment_method,
      (SELECT GROUP_CONCAT(CONCAT(oi.quantity, ' x ', oi.product_name) ORDER BY oi.id SEPARATOR ', ')
       FROM cafe_order_items oi WHERE oi.order_id = o.id) AS items
      FROM cafe_orders o LEFT JOIN cafe_payments p ON p.order_id = o.id
      ORDER BY o.created_at DESC, o.id DESC LIMIT 30`);
    const [tableRows] = await db.query<TableRow[]>('SELECT id, label, seats, status FROM cafe_tables ORDER BY label');
    const [inventoryRows] = await db.query<InventoryRow[]>('SELECT id, name, unit, quantity, reorder_level FROM cafe_inventory_items ORDER BY name');
    const [metricRows] = await db.query<MetricRow[]>(`SELECT
      COALESCE((SELECT SUM(amount) FROM cafe_payments WHERE paid_at >= CURDATE()), 0) AS sales,
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
    const [movementRows] = await db.query<MovementRow[]>(`SELECT m.id, i.name AS item_name, m.delta, i.unit, m.reason, m.created_at
      FROM cafe_stock_movements m JOIN cafe_inventory_items i ON i.id = m.inventory_item_id
      ORDER BY m.created_at DESC, m.id DESC LIMIT 10`);
    const metrics = metricRows[0];
    return Response.json({
      menu: menuRows.map((item) => ({ id: item.id, name: item.name, category: item.category, price: Number(item.price), imageUrl: item.image_url, available: Boolean(item.available) })),
      orders: orderRows.map((order) => ({
        id: `#${order.id}`, tableId: order.table_id, table: order.table_name, status: order.status,
        total: Number(order.total), items: order.items ?? 'No items', paymentMethod: order.payment_method,
        time: new Date(order.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
      })),
      tables: tableRows,
      inventory: inventoryRows.map((item) => ({ id: item.id, name: item.name, unit: item.unit, quantity: Number(item.quantity), reorderLevel: Number(item.reorder_level) })),
      movements: movementRows.map((item) => ({ id: item.id, itemName: item.item_name, delta: Number(item.delta), unit: item.unit, reason: item.reason,
        time: new Date(item.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })),
      metrics: { sales: Number(metrics.sales), orders: Number(metrics.order_count), average: Number(metrics.average), active: Number(metrics.active) },
      popular: popularRows.map((item) => ({ name: item.name, category: item.category, imageUrl: item.image_url, quantity: Number(item.quantity) })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Database unavailable' }, { status: 503 });
  }
}
