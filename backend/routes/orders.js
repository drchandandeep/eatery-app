// routes/orders.js
const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { effectiveStoreStatus } = require('../utils/subscription');
const { getStoreOrderingStatus } = require('../utils/storeStatus');
const { sendOrderConfirmationEmail } = require('../utils/email');
const { DELIVERY_FEE } = require('../utils/config');

const router = express.Router();

// India GST for restaurants is commonly 5% (non-AC / composition scheme).
// DELIVERY_FEE lives in utils/config.js as the single source of truth so
// the backend total and the mobile checkout estimate can never disagree.
const TAX_RATE = 0.05;

// Human-readable version of a getStoreOrderingStatus() reason -- shared so
// the "why can't I order" message is worded identically everywhere it's
// shown (checkout error, menu screen banner).
function closedReasonMessage(reason) {
  switch (reason) {
    case 'subscription_inactive':
      return 'This store is temporarily unavailable for ordering. Please check back later.';
    case 'paused_by_store':
      return 'This store has paused new orders right now. Please check back shortly.';
    case 'outside_hours':
      return 'This store is closed right now. Please check back during its opening hours.';
    default:
      return 'This store is not accepting orders right now.';
  }
}

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
// transaction. This is the only place an order gets written to the
// database (both cash and QR payment methods funnel through here).
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

// POST /api/orders  -> place an order. No payment gateway is involved --
// payment is either collected at delivery (cash or UPI, in person) or paid
// upfront by the customer scanning the store's own QR code and confirming
// they've paid. Either way this endpoint just records the order; there's
// no automatic payment verification for either path (see
// mobile/src/screens/CheckoutScreen.js for why: a QR-based payment can't be
// verified server-side without a real payment gateway, so the store owner
// confirms receipt themselves when advancing the order's status).
// body: { items: [...], address_line, payment_method: 'cash' | 'qr' }
router.post('/', requireAuth, (req, res) => {
  const { items, address_line } = req.body;
  const paymentMethod = req.body.payment_method === 'qr' ? 'qr' : 'cash';
  if (req.user.role !== 'customer' || !req.user.store_id) {
    return res.status(403).json({ error: 'Only customer accounts linked to a store can place orders' });
  }

  const storeId = req.user.store_id;

  // Full stop: subscription lapsed, store paused itself, or outside its
  // operating hours -- any one of these blocks new orders. All three
  // checks live in one place (utils/storeStatus.js) so GET /api/menu can
  // show the same "why is this closed" reason to the customer up front.
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  const orderingStatus = store ? getStoreOrderingStatus(store) : { open: false, reason: 'subscription_inactive' };
  if (!store || !orderingStatus.open) {
    return res.status(402).json({
      error: closedReasonMessage(orderingStatus.reason),
      reason: orderingStatus.reason,
    });
  }

  if (paymentMethod === 'qr' && !store.order_qr_image_base64) {
    return res.status(400).json({ error: 'This store hasn\u2019t set up a payment QR code yet. Please choose Cash on Delivery instead.' });
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
    paymentMethod,
    // Both paths are "pending" from the platform's point of view -- cash is
    // collected at delivery, and a QR payment can't be auto-verified. The
    // store owner is the one who actually knows when money has landed.
    paymentStatus: 'pending',
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
module.exports.closedReasonMessage = closedReasonMessage;
