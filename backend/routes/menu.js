// routes/menu.js
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');
const { effectiveStoreStatus } = require('../utils/subscription');
const { getStoreOrderingStatus } = require('../utils/storeStatus');
const { closedReasonMessage } = require('./orders');
const { MAX_SERVICE_RADIUS_KM } = require('../utils/config');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Menu browsing doesn't strictly require login. This softly decodes the
// token if present, without rejecting the request if it's not.
function softAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // ignore -- treat as anonymous
    }
  }
  next();
}

function resolveStoreId(req) {
  return req.query.store_id || req.user?.store_id || null;
}

// GET /api/menu?store_id=xxx -> categories with nested items for one store
router.get('/', softAuth, asyncHandler(async (req, res) => {
  const storeId = resolveStoreId(req);
  if (!storeId) {
    return res.status(400).json({ error: 'store_id is required (or log in as a customer of a store)' });
  }

  const categories = await db.all('SELECT * FROM categories WHERE store_id = ? ORDER BY sort_order', [storeId]);
  const items = await db.all('SELECT * FROM menu_items WHERE store_id = ? AND is_available = 1', [storeId]);
  const store = await db.get('SELECT * FROM stores WHERE id = ?', [storeId]);

  const byCategory = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  const orderingStatus = store ? getStoreOrderingStatus(store) : { open: false, reason: 'subscription_inactive' };

  res.json({
    store_id: storeId,
    store_name: store?.name || null,
    store_active: store ? effectiveStoreStatus(store) === 'active' : false,
    store_open: orderingStatus.open,
    store_closed_reason: orderingStatus.open ? null : orderingStatus.reason,
    store_closed_message: orderingStatus.open ? null : closedReasonMessage(orderingStatus.reason),
    store_hours: store ? { opens_at: store.opens_at, closes_at: store.closes_at } : null,
    // Needed by the checkout screen to show a live "you're within/outside
    // range" check against the delivery address before the order is even
    // submitted. The backend still re-checks this authoritatively in
    // routes/orders.js -- this is only for a responsive UI.
    store_lat: store?.lat ?? null,
    store_lng: store?.lng ?? null,
    store_delivery_radius_km: store ? Math.min(store.service_radius_km, MAX_SERVICE_RADIUS_KM) : null,
    store_order_qr: store?.order_qr_image_base64
      ? { image_base64: store.order_qr_image_base64, upi_id: store.order_upi_id || null }
      : null,
    categories: byCategory,
  });
}));

// GET /api/menu/items/:id -> full detail incl. option groups + choices
router.get('/items/:id', asyncHandler(async (req, res) => {
  const item = await db.get('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const groupRows = await db.all('SELECT * FROM option_groups WHERE menu_item_id = ?', [item.id]);
  const groups = [];
  for (const g of groupRows) {
    const choices = await db.all('SELECT * FROM option_choices WHERE group_id = ?', [g.id]);
    groups.push({ ...g, choices });
  }

  res.json({ item: { ...item, option_groups: groups } });
}));

module.exports = router;
