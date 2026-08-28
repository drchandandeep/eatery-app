// routes/admin.js
// Everything here requires an authenticated store_admin with an active
// annual subscription. Every query is scoped to req.user.store_id so one
// store's admin can never see or touch another store's data.
const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth, requireStoreAdmin, requireActiveSubscription } = require('../middleware/auth');
const { sendOrderStatusEmail } = require('../utils/email');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAuth, requireStoreAdmin, requireActiveSubscription);

const VALID_STATUSES = ['placed', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

// GET /api/admin/orders  (optional ?status=placed)
router.get('/orders', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const storeId = req.user.store_id;
  const orders = status
    ? await db.all('SELECT * FROM orders WHERE store_id = ? AND status = ? ORDER BY created_at DESC', [storeId, status])
    : await db.all('SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC', [storeId]);
  res.json({ orders });
}));

// PATCH /api/admin/orders/:id/status  { status, eta_minutes? }
router.patch('/orders/:id/status', asyncHandler(async (req, res) => {
  const { status, eta_minutes } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  const order = await db.get('SELECT * FROM orders WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const eta = eta_minutes != null && eta_minutes !== '' ? Math.max(0, Number(eta_minutes)) : null;

  await db.transaction(async (tx) => {
    if (eta != null) {
      await tx.run("UPDATE orders SET status = ?, estimated_delivery_minutes = ?, updated_at = datetime('now') WHERE id = ?", [status, eta, order.id]);
    } else {
      await tx.run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, order.id]);
    }
    await tx.run('INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, ?)', [nanoid(12), order.id, status]);
  });

  if (status === 'confirmed' || status === 'delivered') {
    const statusLabel = status === 'confirmed' ? 'confirmed' : 'delivered';
    const store = await db.get('SELECT name FROM stores WHERE id = ?', [req.user.store_id]);
    const customer = await db.get('SELECT email FROM users WHERE id = ?', [order.user_id]);
    const storeOwner = await db.get("SELECT email FROM users WHERE store_id = ? AND role = 'store_admin'", [req.user.store_id]);
    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [order.id]);
    if (customer) sendOrderStatusEmail(customer.email, updatedOrder, store?.name, statusLabel).catch(() => {});
    if (storeOwner) sendOrderStatusEmail(storeOwner.email, updatedOrder, store?.name, statusLabel).catch(() => {});
  }

  res.json({ order: await db.get('SELECT * FROM orders WHERE id = ?', [order.id]) });
}));

// GET /api/admin/stats  -> quick dashboard numbers, scoped to this store
router.get('/stats', asyncHandler(async (req, res) => {
  const storeId = req.user.store_id;
  const totalOrdersRow = await db.get('SELECT COUNT(*) c FROM orders WHERE store_id = ?', [storeId]);
  const revenueRow = await db.get("SELECT COALESCE(SUM(total),0) s FROM orders WHERE store_id = ? AND status != 'cancelled'", [storeId]);
  const activeOrdersRow = await db.get("SELECT COUNT(*) c FROM orders WHERE store_id = ? AND status NOT IN ('delivered','cancelled')", [storeId]);
  const topItems = await db.all(
    `SELECT oi.name, SUM(oi.quantity) qty
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.store_id = ?
     GROUP BY oi.name ORDER BY qty DESC LIMIT 5`,
    [storeId]
  );

  res.json({
    totalOrders: totalOrdersRow.c,
    revenue: revenueRow.s,
    activeOrders: activeOrdersRow.c,
    topItems,
    store: req.store ? { subscription_expires_at: req.store.subscription_expires_at } : undefined,
  });
}));

// ---- Menu management (scoped to this store) ----

// GET /api/admin/menu -> full menu for editing, including unavailable items
router.get('/menu', asyncHandler(async (req, res) => {
  const storeId = req.user.store_id;
  const categories = await db.all('SELECT * FROM categories WHERE store_id = ? ORDER BY sort_order', [storeId]);
  const items = await db.all('SELECT * FROM menu_items WHERE store_id = ?', [storeId]);

  const byCategory = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));
  const uncategorized = items.filter((i) => !i.category_id);

  res.json({ categories: byCategory, uncategorized });
}));

// POST /api/admin/menu/items
router.post('/menu/items', asyncHandler(async (req, res) => {
  const { category_id, name, description, base_price, is_veg, image_url } = req.body;
  if (!name || base_price == null) return res.status(400).json({ error: 'name and base_price are required' });

  if (category_id) {
    const cat = await db.get('SELECT id FROM categories WHERE id = ? AND store_id = ?', [category_id, req.user.store_id]);
    if (!cat) return res.status(400).json({ error: 'category_id does not belong to your store' });
  }

  const itemId = nanoid(12);
  await db.run(
    `INSERT INTO menu_items (id, store_id, category_id, name, description, base_price, image_url, is_veg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [itemId, req.user.store_id, category_id || null, name, description || '', base_price, image_url || null, is_veg ? 1 : 0]
  );

  res.status(201).json({ item: await db.get('SELECT * FROM menu_items WHERE id = ?', [itemId]) });
}));

// PATCH /api/admin/menu/items/:id
router.patch('/menu/items/:id', asyncHandler(async (req, res) => {
  const item = await db.get('SELECT * FROM menu_items WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const fields = ['category_id', 'name', 'description', 'base_price', 'is_available', 'is_veg', 'image_url'];
  const updates = fields.filter((f) => f in req.body);
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => req.body[f]);
  await db.run(`UPDATE menu_items SET ${setClause} WHERE id = ?`, [...values, item.id]);

  res.json({ item: await db.get('SELECT * FROM menu_items WHERE id = ?', [item.id]) });
}));

// DELETE /api/admin/menu/items/:id
router.delete('/menu/items/:id', asyncHandler(async (req, res) => {
  const result = await db.run('DELETE FROM menu_items WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true });
}));

// POST /api/admin/categories
router.post('/categories', asyncHandler(async (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid(12);
  await db.run('INSERT INTO categories (id, store_id, name, sort_order) VALUES (?, ?, ?, ?)', [id, req.user.store_id, name, sort_order || 0]);
  res.status(201).json({ category: await db.get('SELECT * FROM categories WHERE id = ?', [id]) });
}));

// PATCH /api/admin/categories/:id
router.patch('/categories/:id', asyncHandler(async (req, res) => {
  const cat = await db.get('SELECT * FROM categories WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  const fields = ['name', 'sort_order'];
  const updates = fields.filter((f) => f in req.body);
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => req.body[f]);
  await db.run(`UPDATE categories SET ${setClause} WHERE id = ?`, [...values, cat.id]);

  res.json({ category: await db.get('SELECT * FROM categories WHERE id = ?', [cat.id]) });
}));

// DELETE /api/admin/categories/:id
router.delete('/categories/:id', asyncHandler(async (req, res) => {
  const result = await db.run('DELETE FROM categories WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
}));

module.exports = router;
