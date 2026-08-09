// routes/orders.js
const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const TAX_RATE = 0.08;
const DELIVERY_FEE = 2.99;

// POST /api/orders  -> place a new order
// body: { items: [{ menu_item_id, quantity, selected_options: [{group,choice,price_delta}] }], address_line, payment_method }
// The order's store_id always comes from the logged-in customer's own
// account (req.user.store_id), never from the request body -- a customer
// can only ever order from the one store they registered with.
router.post('/', requireAuth, (req, res) => {
  const { items, address_line, payment_method } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must include at least one item' });
  }
  if (req.user.role !== 'customer' || !req.user.store_id) {
    return res.status(403).json({ error: 'Only customer accounts linked to a store can place orders' });
  }

  const storeId = req.user.store_id;

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, store_id, user_id, status, subtotal, delivery_fee, tax, total, address_line, payment_method)
    VALUES (?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (id, order_id, menu_item_id, name, quantity, unit_price, selected_options)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertHistory = db.prepare(`
    INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, 'placed')
  `);

  let subtotal = 0;
  const resolvedItems = [];

  for (const line of items) {
    const menuItem = db
      .prepare('SELECT * FROM menu_items WHERE id = ? AND store_id = ?')
      .get(line.menu_item_id, storeId);
    if (!menuItem) return res.status(400).json({ error: `Item ${line.menu_item_id} is not available from your store` });

    const optionsDelta = (line.selected_options || []).reduce(
      (sum, o) => sum + (Number(o.price_delta) || 0),
      0
    );
    const unitPrice = menuItem.base_price + optionsDelta;
    const qty = Math.max(1, Number(line.quantity) || 1);
    subtotal += unitPrice * qty;

    resolvedItems.push({
      menu_item_id: menuItem.id,
      name: menuItem.name,
      quantity: qty,
      unit_price: unitPrice,
      selected_options: JSON.stringify(line.selected_options || []),
    });
  }

  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const total = +(subtotal + tax + DELIVERY_FEE).toFixed(2);
  const orderId = nanoid(12);

  const tx = db.transaction(() => {
    insertOrder.run(orderId, storeId, req.user.id, +subtotal.toFixed(2), DELIVERY_FEE, tax, total, address_line || null, payment_method || 'card');
    resolvedItems.forEach((it) =>
      insertItem.run(nanoid(12), orderId, it.menu_item_id, it.name, it.quantity, it.unit_price, it.selected_options)
    );
    insertHistory.run(nanoid(12), orderId);
  });
  tx();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  res.status(201).json({ order: { ...order, items: orderItems } });
});

// GET /api/orders  -> current user's order history
router.get('/', requireAuth, (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({ orders });
});

// GET /api/orders/:id -> single order with items + status history (for live tracking)
router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const isOwner = order.user_id === req.user.id;
  const isStoreAdminForOrder = req.user.role === 'store_admin' && req.user.store_id === order.store_id;
  if (!isOwner && !isStoreAdminForOrder) {
    return res.status(403).json({ error: 'Not your order' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const history = db
    .prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at')
    .all(order.id);

  res.json({ order: { ...order, items, history } });
});

module.exports = router;
