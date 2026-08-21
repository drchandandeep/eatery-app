// routes/orders.js
const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { effectiveStoreStatus } = require('../utils/subscription');
const { sendOrderConfirmationEmail } = require('../utils/email');
const { DELIVERY_FEE } = require('../utils/config');

const router = express.Router();

// India GST for restaurants is commonly 5% (non-AC / composition scheme).
// DELIVERY_FEE lives in utils/config.js as the single source of truth --
// routes/payments.js imports computeOrderTotals rather than redefining
// these, so the two payment paths (cash and Razorpay) can never disagree on
// what a cart actually costs, and the mobile app's checkout estimate reads
// the same number back from the API rather than hardcoding its own copy.
const TAX_RATE = 0.05;

// Recomputes a cart's real price server-side from the store's own menu data
// -- never trusts any price the client sends. Throws a plain Error with a
// user-facing message on any invalid item; callers decide the HTTP status.
function computeOrderTotals(items, storeId) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must include at least one item');
  }

  let subtotal = 0;
  const resolvedItems = [];

  for (const line of items) {
    const menuItem = db
      .prepare('SELECT * FROM menu_items WHERE id = ? AND store_id = ?')
      .get(line.menu_item_id, storeId);
    if (!menuItem) throw new Error(`Item ${line.menu_item_id} is not available from your store`);

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

  return { subtotal: +subtotal.toFixed(2), tax, deliveryFee: DELIVERY_FEE, total, resolvedItems };
}

// Writes the order + its line items + its first status-history row in one
// transaction. Shared by both the cash-on-delivery path below and the
// Razorpay verify-and-place path in routes/payments.js, so there is exactly
// one place that knows how an order gets written to the database.
function insertOrderRecord({ storeId, userId, totals, addressLine, paymentMethod, paymentStatus, paymentGateway, paymentRef }) {
  const orderId = nanoid(12);

  const insertOrder = db.prepare(`
    INSERT INTO orders
      (id, store_id, user_id, status, subtotal, delivery_fee, tax, total, address_line, payment_method, payment_status, payment_gateway, payment_ref)
    VALUES (?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (id, order_id, menu_item_id, name, quantity, unit_price, selected_options)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertHistory = db.prepare(`
    INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, 'placed')
  `);

  const tx = db.transaction(() => {
    insertOrder.run(
      orderId,
      storeId,
      userId,
      totals.subtotal,
      totals.deliveryFee,
      totals.tax,
      totals.total,
      addressLine || null,
      paymentMethod,
      paymentStatus,
      paymentGateway || null,
      paymentRef || null
    );
    totals.resolvedItems.forEach((it) =>
      insertItem.run(nanoid(12), orderId, it.menu_item_id, it.name, it.quantity, it.unit_price, it.selected_options)
    );
    insertHistory.run(nanoid(12), orderId);
  });
  tx();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  return { ...order, items: orderItems };
}

// POST /api/orders  -> place a cash-on-delivery order (no payment gateway).
// For online payment (UPI/netbanking/card via Razorpay), the client instead
// calls POST /api/payments/create-order then /api/payments/verify-and-place-order.
// body: { items: [{ menu_item_id, quantity, selected_options: [{group,choice,price_delta}] }], address_line }
router.post('/', requireAuth, (req, res) => {
  const { items, address_line } = req.body;
  if (req.user.role !== 'customer' || !req.user.store_id) {
    return res.status(403).json({ error: 'Only customer accounts linked to a store can place orders' });
  }

  const storeId = req.user.store_id;

  // Full stop: if the store's annual subscription has lapsed, new orders
  // are blocked immediately -- this is what actually makes the store "go
  // dark" to its own already-registered customers, not just to new signups.
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  if (!store || effectiveStoreStatus(store) !== 'active') {
    return res.status(402).json({
      error: 'This store is temporarily unavailable for ordering (subscription inactive). Please check back later.',
    });
  }

  let totals;
  try {
    totals = computeOrderTotals(items, storeId);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const order = insertOrderRecord({
    storeId,
    userId: req.user.id,
    totals,
    addressLine: address_line,
    paymentMethod: 'cash',
    paymentStatus: 'pending', // collected on delivery
  });

  // Fire-and-forget: never let a slow/broken mail server delay the response
  // the customer is waiting on for their order confirmation.
  sendOrderConfirmationEmail(req.user.email, order, store.name).catch(() => {});

  res.status(201).json({ order });
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
module.exports.computeOrderTotals = computeOrderTotals;
module.exports.insertOrderRecord = insertOrderRecord;
