// routes/admin.js
// Everything here requires an authenticated store_admin with an active
// annual subscription. Every query is scoped to req.user.store_id so one
// store's admin can never see or touch another store's data.
const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth, requireStoreAdmin, requireActiveSubscription } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireStoreAdmin, requireActiveSubscription);

const VALID_STATUSES = ['placed', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

// GET /api/admin/orders  (optional ?status=placed)
router.get('/orders', (req, res) => {
  const { status } = req.query;
  const storeId = req.user.store_id;
  const orders = status
    ? db.prepare('SELECT * FROM orders WHERE store_id = ? AND status = ? ORDER BY created_at DESC').all(storeId, status)
    : db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC').all(storeId);
  res.json({ orders });
});

// PATCH /api/admin/orders/:id/status  { status }
router.patch('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(req.params.id, req.user.store_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, order.id);
    db.prepare('INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, ?)').run(
      nanoid(12),
      order.id,
      status
    );
  });
  tx();

  res.json({ order: db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) });
});

// GET /api/admin/stats  -> quick dashboard numbers, scoped to this store
router.get('/stats', (req, res) => {
  const storeId = req.user.store_id;
  const totalOrders = db.prepare('SELECT COUNT(*) c FROM orders WHERE store_id = ?').get(storeId).c;
  const revenue = db
    .prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE store_id = ? AND status != 'cancelled'")
    .get(storeId).s;
  const activeOrders = db
    .prepare("SELECT COUNT(*) c FROM orders WHERE store_id = ? AND status NOT IN ('delivered','cancelled')")
    .get(storeId).c;
  const topItems = db
    .prepare(
      `SELECT oi.name, SUM(oi.quantity) qty
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = ?
       GROUP BY oi.name ORDER BY qty DESC LIMIT 5`
    )
    .all(storeId);

  res.json({ totalOrders, revenue, activeOrders, topItems, store: req.store ? { subscription_expires_at: req.store.subscription_expires_at } : undefined });
});

// ---- Menu management (scoped to this store) ----

// GET /api/admin/menu -> full menu for editing, including unavailable items
// (the public GET /api/menu only returns is_available=1 items -- this one
// is for the store owner to see and manage everything).
router.get('/menu', (req, res) => {
  const storeId = req.user.store_id;
  const categories = db.prepare('SELECT * FROM categories WHERE store_id = ? ORDER BY sort_order').all(storeId);
  const items = db.prepare('SELECT * FROM menu_items WHERE store_id = ?').all(storeId);

  const byCategory = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));
  const uncategorized = items.filter((i) => !i.category_id);

  res.json({ categories: byCategory, uncategorized });
});

// POST /api/admin/menu/items
router.post('/menu/items', (req, res) => {
  const { category_id, name, description, base_price, is_veg } = req.body;
  if (!name || base_price == null) return res.status(400).json({ error: 'name and base_price are required' });

  if (category_id) {
    const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND store_id = ?').get(category_id, req.user.store_id);
    if (!cat) return res.status(400).json({ error: 'category_id does not belong to your store' });
  }

  const itemId = nanoid(12);
  db.prepare(
    `INSERT INTO menu_items (id, store_id, category_id, name, description, base_price, is_veg)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(itemId, req.user.store_id, category_id || null, name, description || '', base_price, is_veg ? 1 : 0);

  res.status(201).json({ item: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(itemId) });
});

// PATCH /api/admin/menu/items/:id
router.patch('/menu/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND store_id = ?').get(req.params.id, req.user.store_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const fields = ['category_id', 'name', 'description', 'base_price', 'is_available', 'is_veg'];
  const updates = fields.filter((f) => f in req.body);
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => req.body[f]);
  db.prepare(`UPDATE menu_items SET ${setClause} WHERE id = ?`).run(...values, item.id);

  res.json({ item: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.id) });
});

// DELETE /api/admin/menu/items/:id
router.delete('/menu/items/:id', (req, res) => {
  const result = db.prepare('DELETE FROM menu_items WHERE id = ? AND store_id = ?').run(req.params.id, req.user.store_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true });
});

// POST /api/admin/categories
router.post('/categories', (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid(12);
  db.prepare('INSERT INTO categories (id, store_id, name, sort_order) VALUES (?, ?, ?, ?)').run(
    id,
    req.user.store_id,
    name,
    sort_order || 0
  );
  res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(id) });
});

// PATCH /api/admin/categories/:id
router.patch('/categories/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND store_id = ?').get(req.params.id, req.user.store_id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  const fields = ['name', 'sort_order'];
  const updates = fields.filter((f) => f in req.body);
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => req.body[f]);
  db.prepare(`UPDATE categories SET ${setClause} WHERE id = ?`).run(...values, cat.id);

  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id) });
});

// DELETE /api/admin/categories/:id
// Items in this category aren't deleted -- the DB foreign key sets their
// category_id to NULL (see ON DELETE SET NULL in the schema), so they just
// become "uncategorized" rather than disappearing.
router.delete('/categories/:id', (req, res) => {
  const result = db.prepare('DELETE FROM categories WHERE id = ? AND store_id = ?').run(req.params.id, req.user.store_id);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
});

module.exports = router;
