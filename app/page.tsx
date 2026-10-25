'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

type MenuItem = { id: number; name: string; category: string; price: number; imageUrl: string | null; available: boolean };
type Order = { id: string; table: string; items: string; total: number; status: 'Preparing' | 'Ready' | 'Served'; time: string };
type PopularItem = { name: string; category: string | null; imageUrl: string | null; quantity: number };
type Dashboard = { menu: MenuItem[]; orders: Order[]; metrics: { sales: number; orders: number; average: number; active: number }; popular: PopularItem[] };
type CartItem = MenuItem & { qty: number };

const emptyDashboard: Dashboard = { menu: [], orders: [], metrics: { sales: 0, orders: 0, average: 0, active: 0 }, popular: [] };
const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;
const productImageStyle = (imageUrl?: string | null): CSSProperties => {
  if (!imageUrl) return {};
  const [source, tileValue] = imageUrl.split('#');
  const tile = Number(tileValue);
  if (!Number.isInteger(tile) || tile < 0 || tile > 7) {
    return { backgroundImage: `url("${source}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return {
    backgroundImage: `url("${source}")`, backgroundSize: '400% 200%',
    backgroundPosition: `${(tile % 4) * 100 / 3}% ${Math.floor(tile / 4) * 100}%`,
  };
};

export default function Home() {
  const [section, setSection] = useState('Overview');
  const [data, setData] = useState<Dashboard>(emptyDashboard);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All items');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [tableName, setTableName] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('Database unavailable');
      const result = (await response.json()) as Dashboard;
      setData(result);
      setConnected(true);
    } catch {
      setConnected(false);
      setData(emptyDashboard);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);

  const categories = ['All items', ...Array.from(new Set(data.menu.map((item) => item.category)))];
  const filtered = data.menu.filter((item) => item.available && (category === 'All items' || item.category === category) && item.name.toLowerCase().includes(query.toLowerCase()));
  const cartItems = useMemo(() => data.menu.filter((item) => cart[item.id]).map((item) => ({ ...item, qty: cart[item.id] })), [cart, data.menu]);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const notify = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(''), 2800); };
  const addToCart = (id: number) => setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));

  const placeOrder = async () => {
    if (!cartCount || !tableName.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableName.trim(), items: cartItems.map(({ id, qty }) => ({ id, quantity: qty })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save the order.');
      setCart({}); setTableName(''); await loadData(); notify('Order saved to the database.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save the order.'); }
    finally { setSaving(false); }
  };

  const advanceOrder = async (order: Order) => {
    const status = order.status === 'Preparing' ? 'Ready' : order.status === 'Ready' ? 'Served' : 'Served';
    if (status === order.status) return;
    try {
      const response = await fetch('/api/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the order.');
      await loadData(); notify(`${order.id} marked ${status.toLowerCase()}.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not update the order.'); }
  };

  const nav = [{ name: 'Overview', icon: '⌂' }, { name: 'Orders', icon: '▤', badge: data.metrics.active }, { name: 'Menu', icon: '▦' }];
  const noMenu = connected && !loading && data.menu.length === 0;

  return (
    <main className="desktop-shell">
      <div className="app-frame">
        <aside className="sidebar">
          <div className="brand-lockup"><div className="brand-icon">B</div><div><strong>bean &amp; board</strong><small>CAFE MANAGEMENT</small></div></div>
          <div className="side-label">WORKSPACE</div>
          <nav>{nav.map((item) => <button key={item.name} onClick={() => { setSection(item.name); if (item.name === 'Menu') document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' }); if (item.name === 'Orders') document.getElementById('orders-section')?.scrollIntoView({ behavior: 'smooth' }); }} className={`nav-item ${section === item.name ? 'active' : ''}`}><span className="nav-icon">{item.icon}</span><span>{item.name}</span>{item.badge ? <em>{item.badge}</em> : null}</button>)}</nav>
          <div className="sidebar-bottom"><div className="connection-status"><i className={connected ? 'connected' : ''}></i><span>{loading ? 'Connecting…' : connected ? 'MySQL connected' : 'Database unavailable'}</span></div></div>
        </aside>
        <section className="main-area">
          <header className="topbar"><div className="crumb">Cafe <span>/</span> <b>{section}</b></div><div className="top-actions"><button className="icon-button" aria-label="Search menu" onClick={() => document.getElementById('menu-search')?.focus()}>⌕</button><button className="refresh-button" onClick={() => { setLoading(true); void loadData(); }}>Refresh</button></div></header>
          <div className="content-scroll">
            {!connected && !loading && <div className="database-alert"><strong>Can’t reach MySQL.</strong><span>Add your connection string to <code>.env</code>, then refresh. No sample data is being shown.</span></div>}
            <div className="welcome-row"><div><div className="eyebrow">CAFE OVERVIEW</div><h1>{section}</h1><p>Sales, orders, and menu activity from your database.</p></div><button className="primary-button" onClick={() => { setSection('Menu'); document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' }); }}><span>＋</span> New order</button></div>
            <div className="stats-grid">
              <article className="stat-card"><div className="stat-top"><span>Today’s sales</span></div><strong>{loading ? '—' : money(data.metrics.sales)}</strong><div className="stat-foot">From orders recorded today</div></article>
              <article className="stat-card"><div className="stat-top"><span>Orders today</span></div><strong>{loading ? '—' : data.metrics.orders}</strong><div className="stat-foot">From orders recorded today</div></article>
              <article className="stat-card"><div className="stat-top"><span>Average order</span></div><strong>{loading ? '—' : money(data.metrics.average)}</strong><div className="stat-foot">From orders recorded today</div></article>
              <article className="stat-card"><div className="stat-top"><span>Active orders</span></div><strong>{loading ? '—' : data.metrics.active}</strong><div className="stat-foot">Preparing or ready</div></article>
            </div>
            <div className="dashboard-grid">
              <section className="panel orders-panel" id="orders-section"><div className="panel-head"><div><h2>Orders</h2><p>Recent orders from your cafe</p></div><button className="text-button" onClick={() => { setSection('Orders'); void loadData(); }}>Refresh list <span>↻</span></button></div><div className="orders-table"><div className="table-header"><span>ORDER</span><span>ITEMS</span><span>STATUS</span><span></span></div>{loading ? <div className="empty-state">Loading orders…</div> : data.orders.length ? data.orders.map((order) => <div className="order-row" key={order.id}><div className="order-ident"><strong>{order.id}</strong><small>{order.table} · {order.time}</small></div><div className="order-items">{order.items}</div><span className={`status-pill ${order.status.toLowerCase()}`}><i></i>{order.status}</span><button className="row-action" title={`Advance ${order.id} status`} onClick={() => void advanceOrder(order)}>···</button></div>) : <div className="empty-state">No orders in the database.</div>}</div><div className="orders-footer"><span><i className="green-dot"></i> {connected ? 'Order data synced with MySQL' : 'Waiting for database connection'}</span></div></section>
              <section className="panel popular-panel"><div className="panel-head"><div><h2>Popular items</h2><p>Ranked by orders in the last 7 days</p></div></div><div className="popular-list">{loading ? <div className="empty-state">Loading menu activity…</div> : data.popular.length ? data.popular.map((item) => <div className="popular-item" key={item.name}><div className="food-art" role="img" aria-label={item.name} style={productImageStyle(item.imageUrl)} /><div className="popular-copy"><strong>{item.name}</strong><small>{item.category ?? 'Uncategorized'}</small></div><div className="popular-count"><strong>{item.quantity}</strong><small>ordered</small></div></div>) : <div className="empty-state">No order history yet.</div>}</div></section>
            </div>
            <section className="panel menu-panel" id="menu-section"><div className="panel-head menu-head"><div><div className="eyebrow">POINT OF SALE</div><h2>Menu</h2><p>Menu items are loaded from MySQL.</p></div><label className="search-field"><span>⌕</span><input id="menu-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search menu" /></label></div><div className="category-row">{categories.map((item) => <button className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}<span className="category-spacer"></span><span className="menu-count">{loading ? 'Loading…' : `${filtered.length} items`}</span></div><div className="menu-layout"><div className="menu-items">{loading ? <div className="empty-state">Loading menu…</div> : noMenu ? <div className="empty-state">Menu is empty. Run <code>python seed.py</code> to add your catalog.</div> : filtered.length ? filtered.map((item) => <button className="menu-item" key={item.id} onClick={() => addToCart(item.id)}><div className="menu-art" role="img" aria-label={item.name} style={productImageStyle(item.imageUrl)}><span>+</span></div><div className="menu-item-copy"><span>{item.category.toUpperCase()}</span><strong>{item.name}</strong><b>{money(item.price)}</b></div></button>) : <div className="empty-state">No matching menu items.</div>}</div><aside className="cart-box"><div className="cart-title"><div><strong>Current order</strong><small>Order details</small></div><button onClick={() => setCart({})}>Clear</button></div><label className="table-input">Table or order label<input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="e.g. Table 4 or Takeaway" /></label>{cartItems.length ? <div className="cart-lines">{cartItems.map((item: CartItem) => <div className="cart-line" key={item.id}><span className="cart-image" role="img" aria-label={item.name} style={productImageStyle(item.imageUrl)} /><div><strong>{item.name}</strong><small>{money(item.price)} each</small></div><div className="qty-control"><button onClick={() => setCart((current) => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))}>−</button><b>{item.qty}</b><button onClick={() => addToCart(item.id)}>+</button></div><b>{money(item.price * item.qty)}</b></div>)}</div> : <div className="empty-cart"><span>＋</span><b>Your order is empty</b><small>Select a menu item to begin</small></div>}<div className="cart-total"><strong>Total <b>{money(cartTotal)}</b></strong></div><button className="checkout-button" disabled={!cartCount || !tableName.trim() || saving || !connected} onClick={() => void placeOrder()}>{saving ? 'Saving…' : 'Save order'}<span>→</span></button></aside></div></section>
            <footer className="page-footer"><span>Bean &amp; Board</span><span>Live data from MySQL</span></footer>
          </div>
        </section>
      </div>
      {message && <div className="toast"><span>•</span>{message}</div>}
    </main>
  );
}



