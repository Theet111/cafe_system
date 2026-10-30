'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';

type MenuItem = { id: number; name: string; category: string; price: number; imageUrl: string | null; available: boolean };
type Order = { id: string; tableId: number | null; table: string; items: string; total: number; status: 'Preparing' | 'Ready' | 'Served'; paymentMethod: string | null; time: string };
type CafeTable = { id: number; label: string; seats: number; status: 'Available' | 'Occupied' };
type InventoryItem = { id: number; name: string; unit: string; quantity: number; reorderLevel: number };
type Movement = { id: number; itemName: string; delta: number; unit: string; reason: string; time: string };
type PopularItem = { name: string; category: string | null; imageUrl: string | null; quantity: number };
type Dashboard = { menu: MenuItem[]; orders: Order[]; tables: CafeTable[]; inventory: InventoryItem[]; movements: Movement[]; metrics: { sales: number; orders: number; average: number; active: number }; popular: PopularItem[] };
const blank: Dashboard = { menu: [], orders: [], tables: [], inventory: [], movements: [], metrics: { sales: 0, orders: 0, average: 0, active: 0 }, popular: [] };
const currency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const imageStyle = (imageUrl?: string | null): CSSProperties => {
  if (!imageUrl) return {};
  const [source, tileValue] = imageUrl.split('#');
  const tile = Number(tileValue);
  if (!Number.isInteger(tile) || tile < 0 || tile > 7) return { backgroundImage: `url("${source}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return { backgroundImage: `url("${source}")`, backgroundSize: '400% 200%', backgroundPosition: `${((tile % 4) * 100) / 3}% ${Math.floor(tile / 4) * 100}%` };
};
const nextStatus = (status: Order['status']) => status === 'Preparing' ? 'Ready' : status === 'Ready' ? 'Served' : null;
const fetchDashboard = async (): Promise<Dashboard> => {
  const response = await fetch('/api/dashboard', { cache: 'no-store' });
  if (!response.ok) throw new Error('Database unavailable');
  return response.json() as Promise<Dashboard>;
};

export default function Home() {
  const [section, setSection] = useState('Overview');
  const [data, setData] = useState<Dashboard>(blank);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [tableChoice, setTableChoice] = useState('takeaway');
  const [paymentMethod, setPaymentMethod] = useState<Record<string, string>>({});
  const [productForm, setProductForm] = useState({ id: 0, name: '', category: '', price: '', imageUrl: '' });
  const [tableForm, setTableForm] = useState({ label: '', seats: '2' });
  const [inventoryForm, setInventoryForm] = useState({ name: '', unit: '', quantity: '0', reorderLevel: '0' });
  const [adjustment, setAdjustment] = useState({ id: 0, delta: '', reason: '' });

  const refresh = useCallback(async () => {
    try {
      setData(await fetchDashboard());
      setConnected(true);
    } catch { setConnected(false); setData(blank); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void fetchDashboard()
      .then((result) => { if (active) { setData(result); setConnected(true); } })
      .catch(() => { if (active) { setConnected(false); setData(blank); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const show = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 3500); };
  const mutation = async (url: string, method: 'POST' | 'PATCH', payload: object, success: string) => {
    setBusy(true);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Request failed.');
      await refresh(); show(success); return true;
    } catch (error) { show(error instanceof Error ? error.message : 'Request failed.'); return false; }
    finally { setBusy(false); }
  };
  const categories = ['All', ...new Set(data.menu.map((product) => product.category))];
  const products = data.menu.filter((product) => (category === 'All' || product.category === category) && product.name.toLowerCase().includes(query.toLowerCase()));
  const cartItems = useMemo(() => data.menu.filter((product) => cart[product.id] > 0).map((product) => ({ ...product, quantity: cart[product.id] })), [cart, data.menu]);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const lowStock = data.inventory.filter((item) => item.quantity <= item.reorderLevel);

  const submitOrder = async () => {
    if (!cartItems.length) return;
    const tableId = tableChoice === 'takeaway' ? null : Number(tableChoice);
    if (await mutation('/api/orders', 'POST', { tableId, items: cartItems.map((item) => ({ id: item.id, quantity: item.quantity })) }, 'Order saved.')) {
      setCart({}); setTableChoice('takeaway'); setSection('Orders');
    }
  };
  const submitProduct = async (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...productForm, price: Number(productForm.price), imageUrl: productForm.imageUrl || null, available: productForm.id ? data.menu.find((item) => item.id === productForm.id)?.available : true };
    if (await mutation('/api/products', productForm.id ? 'PATCH' : 'POST', payload, productForm.id ? 'Product updated.' : 'Product added.')) setProductForm({ id: 0, name: '', category: '', price: '', imageUrl: '' });
  };
  const submitTable = async (event: FormEvent) => {
    event.preventDefault();
    if (await mutation('/api/tables', 'POST', { label: tableForm.label, seats: Number(tableForm.seats) }, 'Table added.')) setTableForm({ label: '', seats: '2' });
  };
  const submitInventory = async (event: FormEvent) => {
    event.preventDefault();
    if (await mutation('/api/inventory', 'POST', { ...inventoryForm, quantity: Number(inventoryForm.quantity), reorderLevel: Number(inventoryForm.reorderLevel) }, 'Inventory item added.')) setInventoryForm({ name: '', unit: '', quantity: '0', reorderLevel: '0' });
  };
  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    if (await mutation('/api/inventory', 'PATCH', { id: adjustment.id, delta: Number(adjustment.delta), reason: adjustment.reason }, 'Stock adjusted.')) setAdjustment({ id: 0, delta: '', reason: '' });
  };
  const nav = ['Overview', 'Orders', 'Menu', 'Tables', 'Inventory', 'Reports'];

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">B</div><div><strong>bean &amp; board</strong><small>CAFE MANAGEMENT</small></div></div>
      <div className="side-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{nav.map((name) => <button key={name} className={section === name ? 'nav-link active' : 'nav-link'} onClick={() => setSection(name)}>{name}{name === 'Orders' && data.metrics.active > 0 && <span>{data.metrics.active}</span>}</button>)}</nav>
      <div className="connection"><i className={connected ? 'online' : ''} />{loading ? 'Connecting' : connected ? 'MySQL connected' : 'Database unavailable'}</div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div>CAFE / <strong>{section.toUpperCase()}</strong></div><button onClick={() => { setLoading(true); void refresh(); }}>Refresh data</button></header>
      <div className="content">
        {!connected && !loading && <div className="alert">MySQL is unavailable. Add your connection string to .env and refresh this page.</div>}
        <div className="page-heading"><div><p className="eyebrow">OPERATIONS</p><h1>{section}</h1><p>{section === 'Overview' ? 'A current view of your cafe from MySQL.' : `Manage ${section.toLowerCase()} records in MySQL.`}</p></div>{section !== 'Menu' && <button className="primary" onClick={() => setSection('Menu')}>New order</button>}</div>

        {section === 'Overview' && <>
          <div className="stats">
            <article><span>Paid sales today</span><strong>{loading ? '—' : currency(data.metrics.sales)}</strong><small>Payments recorded today</small></article>
            <article><span>Orders today</span><strong>{loading ? '—' : data.metrics.orders}</strong><small>Orders created today</small></article>
            <article><span>Average order</span><strong>{loading ? '—' : currency(data.metrics.average)}</strong><small>Today’s orders</small></article>
            <article><span>Active orders</span><strong>{loading ? '—' : data.metrics.active}</strong><small>Preparing or ready</small></article>
          </div>
          <div className="two-column"><section className="card"><div className="section-head"><div><h2>Recent orders</h2><p>Latest activity</p></div><button className="plain" onClick={() => setSection('Orders')}>View all</button></div>{data.orders.length ? data.orders.slice(0, 5).map((order) => <div className="simple-row" key={order.id}><div><strong>{order.id} · {order.table}</strong><small>{order.items}</small></div><span className={`pill ${order.status.toLowerCase()}`}>{order.status}</span></div>) : <p className="empty">No orders in the database.</p>}</section>
          <section className="card"><div className="section-head"><div><h2>Stock to review</h2><p>At or below reorder level</p></div><button className="plain" onClick={() => setSection('Inventory')}>Inventory</button></div>{lowStock.length ? lowStock.slice(0, 5).map((item) => <div className="simple-row" key={item.id}><strong>{item.name}</strong><span>{item.quantity} {item.unit}</span></div>) : <p className="empty">No low stock items.</p>}</section></div>
        </>}

        {section === 'Orders' && <section className="card"><div className="section-head"><div><h2>Order queue</h2><p>Update preparation and record payment</p></div></div>{data.orders.length ? <div className="order-list">{data.orders.map((order) => <article className="order-entry" key={order.id}><div><strong>{order.id} · {order.table}</strong><small>{order.time} · {order.items}</small><b>{currency(order.total)}</b></div><div className="order-controls"><span className={`pill ${order.status.toLowerCase()}`}>{order.status}</span>{nextStatus(order.status) && <button disabled={busy} onClick={() => void mutation('/api/orders', 'PATCH', { id: order.id, status: nextStatus(order.status) }, 'Order status updated.')}>Mark {nextStatus(order.status)}</button>}{order.paymentMethod ? <span className="paid">Paid by {order.paymentMethod}</span> : <><select aria-label={`Payment method for ${order.id}`} value={paymentMethod[order.id] || 'Cash'} onChange={(event) => setPaymentMethod({ ...paymentMethod, [order.id]: event.target.value })}><option>Cash</option><option>Card</option><option>UPI</option></select><button disabled={busy} onClick={() => void mutation('/api/payments', 'POST', { orderId: order.id, method: paymentMethod[order.id] || 'Cash' }, 'Payment recorded.')}>Record payment</button></>}</div></article>)}</div> : <p className="empty">No orders yet. Add an order from the menu.</p>}</section>}

        {section === 'Menu' && <>
          <div className="two-column menu-layout"><section className="card"><div className="section-head"><div><h2>Point of sale</h2><p>Choose products for a new order</p></div><input className="search" aria-label="Search menu" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search menu" /></div><div className="filters">{categories.map((name) => <button key={name} className={category === name ? 'selected' : ''} onClick={() => setCategory(name)}>{name}</button>)}</div><div className="product-grid">{products.filter((item) => item.available).map((item) => <button className="product-card" key={item.id} onClick={() => setCart((current) => ({ ...current, [item.id]: (current[item.id] || 0) + 1 }))}><div className="product-photo" role="img" aria-label={item.name} style={imageStyle(item.imageUrl)} /><small>{item.category}</small><strong>{item.name}</strong><b>{currency(item.price)}</b></button>)}</div>{!products.some((item) => item.available) && <p className="empty">No available products. Add a product below or run python seed.py.</p>}</section>
          <section className="card order-cart"><div className="section-head"><div><h2>Current order</h2><p>{cartItems.length} products selected</p></div><button className="plain" onClick={() => setCart({})}>Clear</button></div><label>Service<select value={tableChoice} onChange={(event) => setTableChoice(event.target.value)}><option value="takeaway">Takeaway</option>{data.tables.filter((table) => table.status === 'Available' || table.id === Number(tableChoice)).map((table) => <option key={table.id} value={table.id}>{table.label} · {table.seats} seats</option>)}</select></label>{cartItems.length ? cartItems.map((item) => <div className="cart-row" key={item.id}><div className="thumb" role="img" aria-label={item.name} style={imageStyle(item.imageUrl)} /><div><strong>{item.name}</strong><small>{currency(item.price)}</small></div><div className="stepper"><button onClick={() => setCart((current) => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))}>−</button>{item.quantity}<button onClick={() => setCart((current) => ({ ...current, [item.id]: current[item.id] + 1 }))}>+</button></div></div>) : <p className="empty">Choose a product to begin.</p>}<div className="cart-bottom"><div><span>Total</span><strong>{currency(cartTotal)}</strong></div><button className="primary wide" disabled={!cartItems.length || !connected || busy} onClick={() => void submitOrder()}>Save order</button></div></section></div>
          <section className="card management"><div className="section-head"><div><h2>Product catalog</h2><p>Add products, edit details, and control availability</p></div></div><form className="inline-form" onSubmit={(event) => void submitProduct(event)}><label>Name<input required maxLength={120} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label><label>Category<input required maxLength={60} value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} /></label><label>Price<input required type="number" min="0.01" step="0.01" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label><label>Image path<input placeholder="/products/item.jpg" value={productForm.imageUrl} onChange={(event) => setProductForm({ ...productForm, imageUrl: event.target.value })} /></label><button className="primary" disabled={busy}>{productForm.id ? 'Save changes' : 'Add product'}</button>{productForm.id > 0 && <button type="button" onClick={() => setProductForm({ id: 0, name: '', category: '', price: '', imageUrl: '' })}>Cancel</button>}</form><div className="record-list">{data.menu.map((item) => <div className="record-row" key={item.id}><div className="thumb" role="img" aria-label={item.name} style={imageStyle(item.imageUrl)} /><div className="record-name"><strong>{item.name}</strong><small>{item.category} · {currency(item.price)}</small></div><span className={`pill ${item.available ? 'ready' : 'served'}`}>{item.available ? 'Available' : 'Hidden'}</span><button onClick={() => setProductForm({ id: item.id, name: item.name, category: item.category, price: String(item.price), imageUrl: item.imageUrl || '' })}>Edit</button><button disabled={busy} onClick={() => void mutation('/api/products', 'PATCH', { ...item, available: !item.available }, 'Availability updated.')}>{item.available ? 'Hide' : 'Show'}</button></div>)}</div></section>
        </>}

        {section === 'Tables' && <section className="card"><div className="section-head"><div><h2>Seating</h2><p>Tables change to occupied when an order is opened</p></div></div><form className="inline-form" onSubmit={(event) => void submitTable(event)}><label>Table label<input required maxLength={80} value={tableForm.label} onChange={(event) => setTableForm({ ...tableForm, label: event.target.value })} placeholder="Table 1" /></label><label>Seats<input required type="number" min="1" max="30" value={tableForm.seats} onChange={(event) => setTableForm({ ...tableForm, seats: event.target.value })} /></label><button className="primary" disabled={busy}>Add table</button></form><div className="table-grid">{data.tables.map((table) => <article className="table-tile" key={table.id}><strong>{table.label}</strong><small>{table.seats} seats</small><span className={`pill ${table.status === 'Available' ? 'ready' : 'preparing'}`}>{table.status}</span><button disabled={busy} onClick={() => void mutation('/api/tables', 'PATCH', { id: table.id, status: table.status === 'Available' ? 'Occupied' : 'Available' }, 'Table status updated.')}>{table.status === 'Available' ? 'Mark occupied' : 'Mark available'}</button></article>)}</div>{!data.tables.length && <p className="empty">No tables yet. Add your first table above.</p>}</section>}

        {section === 'Inventory' && <><section className="card"><div className="section-head"><div><h2>Inventory items</h2><p>Track quantities and reorder levels</p></div></div><form className="inline-form" onSubmit={(event) => void submitInventory(event)}><label>Item name<input required maxLength={120} value={inventoryForm.name} onChange={(event) => setInventoryForm({ ...inventoryForm, name: event.target.value })} /></label><label>Unit<input required maxLength={30} placeholder="kg, L, pcs" value={inventoryForm.unit} onChange={(event) => setInventoryForm({ ...inventoryForm, unit: event.target.value })} /></label><label>Opening quantity<input required type="number" min="0" step="0.01" value={inventoryForm.quantity} onChange={(event) => setInventoryForm({ ...inventoryForm, quantity: event.target.value })} /></label><label>Reorder at<input required type="number" min="0" step="0.01" value={inventoryForm.reorderLevel} onChange={(event) => setInventoryForm({ ...inventoryForm, reorderLevel: event.target.value })} /></label><button className="primary" disabled={busy}>Add item</button></form><div className="record-list">{data.inventory.map((item) => <div className="record-row" key={item.id}><div className="record-name"><strong>{item.name}</strong><small>Reorder at {item.reorderLevel} {item.unit}</small></div><b>{item.quantity} {item.unit}</b><span className={`pill ${item.quantity <= item.reorderLevel ? 'preparing' : 'ready'}`}>{item.quantity <= item.reorderLevel ? 'Low stock' : 'In stock'}</span><button onClick={() => setAdjustment({ id: item.id, delta: '', reason: '' })}>Adjust</button></div>)}</div>{!data.inventory.length && <p className="empty">No inventory items yet.</p>}</section>{adjustment.id > 0 && <section className="card"><div className="section-head"><div><h2>Adjust stock</h2><p>{data.inventory.find((item) => item.id === adjustment.id)?.name}</p></div></div><form className="inline-form" onSubmit={(event) => void submitAdjustment(event)}><label>Change in quantity<input required type="number" step="0.01" value={adjustment.delta} onChange={(event) => setAdjustment({ ...adjustment, delta: event.target.value })} placeholder="Use a negative number to reduce stock" /></label><label>Reason<input required maxLength={160} value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} /></label><button className="primary" disabled={busy}>Save adjustment</button><button type="button" onClick={() => setAdjustment({ id: 0, delta: '', reason: '' })}>Cancel</button></form></section>}<section className="card"><div className="section-head"><div><h2>Stock movements</h2><p>Recent recorded changes</p></div></div>{data.movements.map((item) => <div className="simple-row" key={item.id}><div><strong>{item.itemName}</strong><small>{item.reason} · {item.time}</small></div><span>{item.delta > 0 ? '+' : ''}{item.delta} {item.unit}</span></div>)}{!data.movements.length && <p className="empty">No stock movements yet.</p>}</section></>}

        {section === 'Reports' && <><div className="stats"><article><span>Paid sales today</span><strong>{currency(data.metrics.sales)}</strong><small>From recorded payments</small></article><article><span>Orders today</span><strong>{data.metrics.orders}</strong><small>Created today</small></article><article><span>Average order</span><strong>{currency(data.metrics.average)}</strong><small>Created today</small></article><article><span>Items at reorder level</span><strong>{lowStock.length}</strong><small>Inventory attention</small></article></div><section className="card"><div className="section-head"><div><h2>Popular products</h2><p>Quantity ordered in the last seven days</p></div></div>{data.popular.map((item) => <div className="simple-row" key={item.name}><div className="thumb" role="img" aria-label={item.name} style={imageStyle(item.imageUrl)} /><div><strong>{item.name}</strong><small>{item.category || 'Uncategorized'}</small></div><span>{item.quantity} ordered</span></div>)}{!data.popular.length && <p className="empty">No order history yet.</p>}</section></>}
      </div>
    </div>
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
