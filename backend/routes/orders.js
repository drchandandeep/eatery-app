// routes/orders.js
const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { effectiveStoreStatus } = require('../utils/subscription');
const { getStoreOrderingStatus } = require('../utils/storeStatus');
const { sendOrderConfirmationEmail, sendNewOrderNotification } = require('../utils/email');
const { haversineKm, isValidCoordinate } = require('../utils/geo');
const { DELIVERY_FEE, MAX_SERVICE_RADIUS_KM } = require('../utils/config');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const TAX_RATE = 0.05;

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
// -- never trusts any price the client sends.
async function computeOrderTotals(items, storeId) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must include at least one item');
  }

  let subtotal = 0;
  const resolvedItems = [];

  for (const line of items) {
    const menuItem = await db.get('SELECT * FROM menu_items WHERE id = ? AND store_id = ?', [line.menu_item_id, storeId]);
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
// transaction. This is the only place an order gets written to the database.
async function insertOrderRecord({ storeId, userId, totals, addressLine, addressLat, addressLng, paymentMethod, paymentStatus, paymentGateway, paymentRef }) {
  const orderId = nanoid(12);

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO orders
        (id, store_id, user_id, status, subtotal, delivery_fee, tax, total, address_line, address_lat, address_lng, payment_method, payment_status, payment_gateway, payment_ref)
       VALUES (?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        storeId,
        userId,
        totals.subtotal,
        totals.deliveryFee,
        totals.tax,
        totals.total,
        addressLine || null,
        addressLat != null ? Number(addressLat) : null,
        addressLng != null ? Number(addressLng) : null,
        paymentMethod,
        paymentStatus,
        paymentGateway || null,
        paymentRef || null,
      ]
    );
    for (const it of totals.resolvedItems) {
      await tx.run(
        'INSERT INTO order_items (id, order_id, menu_item_id, name, quantity, unit_price, selected_options) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nanoid(12), orderId, it.menu_item_id, it.name, it.quantity, it.unit_price, it.selected_options]
      );
    }
    await tx.run("INSERT INTO order_status_history (id, order_id, status) VALUES (?, ?, 'placed')", [nanoid(12), orderId]);
  });

  const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  const orderItems = await db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  return { ...order, items: orderItems };
}

// POST /api/orders  -> place an order.
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { items, address_line, address_lat, address_lng } = req.body;
  const paymentMethod = req.body.payment_method === 'qr' ? 'qr' : 'cash';
  if (req.user.role !== 'customer' || !req.user.store_id) {
    return res.status(403).json({ error: 'Only customer accounts linked to a store can place orders' });
  }

  if (!address_line || !String(address_line).trim()) {
    return res.status(400).json({ error: 'A delivery address is required' });
  }

  const storeId = req.user.store_id;

  const store = await db.get('SELECT * FROM stores WHERE id = ?', [storeId]);
  const orderingStatus = store ? getStoreOrderingStatus(store) : { open: false, reason: 'subscription_inactive' };
  if (!store || !orderingStatus.open) {
    return res.status(402).json({
      error: closedReasonMessage(orderingStatus.reason),
      reason: orderingStatus.reason,
    });
  }

  // The DELIVERY address must itself be within the store's service radius --
  // not just the address the customer registered with. Previously only the
  // one-time registration address was ever checked; a customer validly
  // registered at 2km could type any checkout address, even 50km away, and
  // the order would still go through. This applies the same 0-7km rule,
  // live, to every order's actual delivery location.
  if (!isValidCoordinate(Number(address_lat), Number(address_lng))) {
    return res.status(400).json({
      error: 'A delivery location is required to verify this address is within the store\u2019s delivery area. Please share your location for this delivery address.',
      reason: 'address_location_required',
    });
  }
  const distanceKm = haversineKm(Number(address_lat), Number(address_lng), store.lat, store.lng);
  const allowedRadius = Math.min(store.service_radius_km, MAX_SERVICE_RADIUS_KM);
  if (distanceKm > allowedRadius) {
    return res.status(403).json({
      error: `This delivery address is ${distanceKm.toFixed(1)}km from ${store.name}, which is outside its ${allowedRadius}km delivery area. Please choose a delivery address within range.`,
      reason: 'address_outside_radius',
      distance_km: +distanceKm.toFixed(2),
      allowed_radius_km: allowedRadius,
    });
  }

  if (paymentMethod === 'qr' && !store.order_qr_image_base64) {
    return res.status(400).json({ error: 'This store hasn\u2019t set up a payment QR code yet. Please choose Cash on Delivery instead.' });
  }

  let totals;
  try {
    totals = await computeOrderTotals(items, storeId);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const order = await insertOrderRecord({
    storeId,
    userId: req.user.id,
    totals,
    addressLine: address_line,
    addressLat: address_lat,
    addressLng: address_lng,
    paymentMethod,
    paymentStatus: 'pending',
  });

  sendOrderConfirmationEmail(req.user.email, order, store.name).catch(() => {});

  const storeOwner = await db.get("SELECT email FROM users WHERE store_id = ? AND role = 'store_admin'", [storeId]);
  if (storeOwner) sendNewOrderNotification(storeOwner.email, order, store.name).catch(() => {});

  res.status(201).json({ order });
}));

// GET /api/orders  -> current user's order history
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const orders = await db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json({ orders });
}));

// GET /api/orders/:id -> single order with items + status history
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const isOwner = order.user_id === req.user.id;
  const isStoreAdminForOrder = req.user.role === 'store_admin' && req.user.store_id === order.store_id;
  if (!isOwner && !isStoreAdminForOrder) {
    return res.status(403).json({ error: 'Not your order' });
  }

  const items = await db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  const history = await db.all('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at', [order.id]);

  res.json({ order: { ...order, items, history } });
}));

module.exports = router;
module.exports.computeOrderTotals = computeOrderTotals;
module.exports.insertOrderRecord = insertOrderRecord;
module.exports.closedReasonMessage = closedReasonMessage;
