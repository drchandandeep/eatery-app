// routes/stores.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth, requireStoreAdmin, JWT_SECRET } = require('../middleware/auth');
const { haversineKm, isValidCoordinate } = require('../utils/geo');
const { effectiveStoreStatus: effectiveStatus } = require('../utils/subscription');
const { MIN_SERVICE_RADIUS_KM, MAX_SERVICE_RADIUS_KM, DEFAULT_SERVICE_RADIUS_KM } = require('../utils/config');
const { createStandardMenu } = require('../db/kahumboMenu');
const { sendSubscriptionSubmittedEmail } = require('../utils/email');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Fields that describe "who this store's account is" and "where the store
// physically is". Per product requirement, once a store registers with an
// email + address, that combo can never change -- otherwise one paying
// account could be walked around to represent a different physical store.
const LOCKED_STORE_FIELDS = ['owner_email', 'address_line', 'city', 'zip', 'lat', 'lng'];

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, store_id: user.store_id || null },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function publicStore(store) {
  return {
    id: store.id,
    name: store.name,
    address_line: store.address_line,
    city: store.city,
    zip: store.zip,
    lat: store.lat,
    lng: store.lng,
    service_radius_km: store.service_radius_km,
    annual_fee: store.annual_fee,
    subscription_status: effectiveStatus(store),
    subscription_started_at: store.subscription_started_at,
    subscription_expires_at: store.subscription_expires_at,
    opens_at: store.opens_at,
    closes_at: store.closes_at,
    accepting_orders: !!store.accepting_orders,
    order_qr_image_base64: store.order_qr_image_base64 || null,
    order_upi_id: store.order_upi_id || null,
  };
}

// POST /api/stores/register
router.post('/register', asyncHandler(async (req, res) => {
  const {
    owner_name,
    owner_email,
    owner_password,
    store_name,
    address_line,
    city,
    zip,
    lat,
    lng,
    order_qr_image_base64,
    order_upi_id,
  } = req.body;

  if (!owner_name || !owner_email || !owner_password || !store_name || !address_line) {
    return res.status(400).json({
      error: 'owner_name, owner_email, owner_password, store_name and address_line are required',
    });
  }
  if (!isValidCoordinate(Number(lat), Number(lng))) {
    return res.status(400).json({
      error:
        'A valid store location (lat/lng) is required. Share your current location or drop a pin on the store address.',
    });
  }

  const normalizedEmail = owner_email.toLowerCase().trim();

  const existingStore = await db.get('SELECT id FROM stores WHERE owner_email = ?', [normalizedEmail]);
  if (existingStore) {
    return res.status(409).json({
      error: 'This email is already registered to a store. Each store must register with its own unique email.',
    });
  }
  const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existingUser) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const storeId = nanoid(12);
  const userId = nanoid(12);

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO stores
        (id, name, owner_email, address_line, city, zip, lat, lng, service_radius_km, subscription_status, order_qr_image_base64, order_upi_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?)`,
      [
        storeId,
        store_name,
        normalizedEmail,
        address_line,
        city || null,
        zip || null,
        Number(lat),
        Number(lng),
        DEFAULT_SERVICE_RADIUS_KM,
        order_qr_image_base64 || null,
        order_upi_id || null,
      ]
    );

    await tx.run(
      `INSERT INTO users (id, name, email, phone, password_hash, role, store_id)
       VALUES (?, ?, ?, ?, ?, 'store_admin', ?)`,
      [userId, owner_name, normalizedEmail, req.body.owner_phone || null, bcrypt.hashSync(owner_password, 10), storeId]
    );

    // Kahumbo is one brand with a standard menu across every location --
    // every new store gets its own full copy of that menu immediately.
    await createStandardMenu(storeId, tx);
  });

  const store = await db.get('SELECT * FROM stores WHERE id = ?', [storeId]);
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  const token = signToken(user);

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id },
    store: publicStore(store),
    message: 'Store registered with the standard Kahumbo menu already loaded. An annual subscription must be active before customers can order.',
  });
}));

// GET /api/stores/nearby?lat=&lng=&radius_km=10
router.get('/nearby', asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!isValidCoordinate(lat, lng)) {
    return res.status(400).json({ error: 'Valid lat and lng query params are required' });
  }
  const radiusKm = Math.min(Number(req.query.radius_km) || MAX_SERVICE_RADIUS_KM, MAX_SERVICE_RADIUS_KM);

  const stores = await db.all('SELECT * FROM stores', []);
  const nearby = stores
    .map((s) => ({ ...s, distance_km: haversineKm(lat, lng, s.lat, s.lng) }))
    .filter((s) => effectiveStatus(s) === 'active' && s.distance_km <= Math.min(radiusKm, s.service_radius_km))
    .sort((a, b) => a.distance_km - b.distance_km)
    .map((s) => ({ ...publicStore(s), distance_km: +s.distance_km.toFixed(2) }));

  res.json({ stores: nearby });
}));

// GET /api/stores/me  (store_admin only)
router.get('/me', requireAuth, requireStoreAdmin, asyncHandler(async (req, res) => {
  const store = await db.get('SELECT * FROM stores WHERE id = ?', [req.user.store_id]);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json({ store: publicStore(store) });
}));

// PATCH /api/stores/me  (store_admin only)
router.patch('/me', requireAuth, requireStoreAdmin, asyncHandler(async (req, res) => {
  const attemptedLockedFields = LOCKED_STORE_FIELDS.filter((f) => f in req.body);
  if (attemptedLockedFields.length > 0) {
    return res.status(403).json({
      error: `These fields are permanent and cannot be changed after registration: ${attemptedLockedFields.join(', ')}`,
    });
  }

  const store = await db.get('SELECT * FROM stores WHERE id = ?', [req.user.store_id]);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const updates = {};
  if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
  if (req.body.service_radius_km != null) {
    const r = Number(req.body.service_radius_km);
    if (!Number.isFinite(r) || r < MIN_SERVICE_RADIUS_KM || r > MAX_SERVICE_RADIUS_KM) {
      return res.status(400).json({
        error: `service_radius_km must be between ${MIN_SERVICE_RADIUS_KM} and ${MAX_SERVICE_RADIUS_KM}`,
      });
    }
    updates.service_radius_km = r;
  }
  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (req.body.opens_at != null) {
    if (!HHMM.test(req.body.opens_at)) return res.status(400).json({ error: 'opens_at must be in HH:MM 24h format' });
    updates.opens_at = req.body.opens_at;
  }
  if (req.body.closes_at != null) {
    if (!HHMM.test(req.body.closes_at)) return res.status(400).json({ error: 'closes_at must be in HH:MM 24h format' });
    updates.closes_at = req.body.closes_at;
  }
  if ((updates.opens_at || store.opens_at) >= (updates.closes_at || store.closes_at)) {
    return res.status(400).json({ error: 'opens_at must be earlier than closes_at' });
  }
  if (req.body.accepting_orders != null) {
    updates.accepting_orders = req.body.accepting_orders ? 1 : 0;
  }
  if ('order_qr_image_base64' in req.body) {
    updates.order_qr_image_base64 = req.body.order_qr_image_base64 || null;
  }
  if ('order_upi_id' in req.body) {
    updates.order_upi_id = req.body.order_upi_id || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid, editable fields supplied' });
  }

  const setClause = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
  await db.run(`UPDATE stores SET ${setClause} WHERE id = ?`, [...Object.values(updates), store.id]);

  res.json({ store: publicStore(await db.get('SELECT * FROM stores WHERE id = ?', [store.id])) });
}));

// ---- Annual subscription payment (own-QR + manual approval) ----

// GET /api/stores/subscription-qr  (any authenticated store_admin)
router.get('/subscription-qr', requireAuth, requireStoreAdmin, asyncHandler(async (req, res) => {
  const qr = await db.get("SELECT value FROM platform_settings WHERE key = 'qr_image_base64'", []);
  const upiId = await db.get("SELECT value FROM platform_settings WHERE key = 'upi_id'", []);
  const store = await db.get('SELECT annual_fee FROM stores WHERE id = ?', [req.user.store_id]);
  res.json({
    qr_image_base64: qr?.value || null,
    upi_id: upiId?.value || null,
    amount: store?.annual_fee || null,
  });
}));

// POST /api/stores/subscription/submit-proof  (store_admin only)
router.post('/subscription/submit-proof', requireAuth, requireStoreAdmin, asyncHandler(async (req, res) => {
  const { screenshot_base64, note } = req.body;
  if (!screenshot_base64) {
    return res.status(400).json({ error: 'screenshot_base64 is required -- upload a screenshot of your payment' });
  }

  const store = await db.get('SELECT * FROM stores WHERE id = ?', [req.user.store_id]);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const requestId = nanoid(12);
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO subscription_payment_requests (id, store_id, screenshot_base64, note, amount, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [requestId, store.id, screenshot_base64, note || null, store.annual_fee]
    );

    if (store.subscription_status !== 'active') {
      await tx.run("UPDATE stores SET subscription_status = 'pending_review' WHERE id = ?", [store.id]);
    }
  });

  sendSubscriptionSubmittedEmail(req.user.email, store.name).catch(() => {});

  res.status(201).json({
    request: await db.get('SELECT * FROM subscription_payment_requests WHERE id = ?', [requestId]),
    store: publicStore(await db.get('SELECT * FROM stores WHERE id = ?', [store.id])),
    message: 'Payment proof submitted. Your subscription will activate once it\u2019s reviewed and approved.',
  });
}));

// GET /api/stores/subscription/requests  (store_admin only)
router.get('/subscription/requests', requireAuth, requireStoreAdmin, asyncHandler(async (req, res) => {
  const requests = await db.all(
    'SELECT id, note, amount, status, created_at, reviewed_at FROM subscription_payment_requests WHERE store_id = ? ORDER BY created_at DESC',
    [req.user.store_id]
  );
  res.json({ requests });
}));

module.exports = router;
