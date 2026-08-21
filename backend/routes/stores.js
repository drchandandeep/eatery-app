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
  };
}

// POST /api/stores/register
// Registers a brand-new store AND its owner account in one step. The owner
// email and the store address supplied here are permanent -- there is no
// endpoint anywhere in this API that can change them afterward.
// body: { owner_name, owner_email, owner_password, store_name,
//         address_line, city, zip, lat, lng }
router.post('/register', (req, res) => {
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

  // One email = one store, forever. This is the anti-abuse rule: it stops
  // someone registering once and re-using the same account for a different
  // store address down the line.
  const existingStore = db.prepare('SELECT id FROM stores WHERE owner_email = ?').get(normalizedEmail);
  if (existingStore) {
    return res.status(409).json({
      error: 'This email is already registered to a store. Each store must register with its own unique email.',
    });
  }
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const storeId = nanoid(12);
  const userId = nanoid(12);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO stores
        (id, name, owner_email, address_line, city, zip, lat, lng, service_radius_km, subscription_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'inactive')`
    ).run(storeId, store_name, normalizedEmail, address_line, city || null, zip || null, Number(lat), Number(lng), DEFAULT_SERVICE_RADIUS_KM);

    db.prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, store_id)
       VALUES (?, ?, ?, ?, ?, 'store_admin', ?)`
    ).run(userId, owner_name, normalizedEmail, req.body.owner_phone || null, bcrypt.hashSync(owner_password, 10), storeId);
  });
  tx();

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const token = signToken(user);

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id },
    store: publicStore(store),
    message: 'Store registered. An annual subscription must be active before customers can order.',
  });
});

// GET /api/stores/nearby?lat=&lng=&radius_km=10
// Public lookup used by the customer signup screen: only stores with an
// active subscription and within range are eligible for new signups.
router.get('/nearby', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!isValidCoordinate(lat, lng)) {
    return res.status(400).json({ error: 'Valid lat and lng query params are required' });
  }
  const radiusKm = Math.min(Number(req.query.radius_km) || MAX_SERVICE_RADIUS_KM, MAX_SERVICE_RADIUS_KM);

  const stores = db.prepare('SELECT * FROM stores').all();
  const nearby = stores
    .map((s) => ({ ...s, distance_km: haversineKm(lat, lng, s.lat, s.lng) }))
    .filter((s) => effectiveStatus(s) === 'active' && s.distance_km <= Math.min(radiusKm, s.service_radius_km))
    .sort((a, b) => a.distance_km - b.distance_km)
    .map((s) => ({ ...publicStore(s), distance_km: +s.distance_km.toFixed(2) }));

  res.json({ stores: nearby });
});

// GET /api/stores/me  (store_admin only)
router.get('/me', requireAuth, requireStoreAdmin, (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.user.store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json({ store: publicStore(store) });
});

// PATCH /api/stores/me  (store_admin only)
// Only non-identity fields can ever be changed here. Attempting to change
// the owner email or address is explicitly rejected, not just ignored, so
// the restriction is visible rather than silently swallowed.
router.patch('/me', requireAuth, requireStoreAdmin, (req, res) => {
  const attemptedLockedFields = LOCKED_STORE_FIELDS.filter((f) => f in req.body);
  if (attemptedLockedFields.length > 0) {
    return res.status(403).json({
      error: `These fields are permanent and cannot be changed after registration: ${attemptedLockedFields.join(', ')}`,
    });
  }

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.user.store_id);
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

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid, editable fields supplied' });
  }

  const setClause = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE stores SET ${setClause} WHERE id = ?`).run(...Object.values(updates), store.id);

  res.json({ store: publicStore(db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id)) });
});

// ---- Annual subscription payment (own-QR + manual approval) ----
//
// There is no automated payment gateway for the subscription -- the store
// owner pays via the platform's UPI QR code (see GET /subscription-qr) and
// uploads a screenshot as evidence. A platform_admin then reviews it and
// approves/rejects (see routes/platform.js). This keeps things honest: an
// uploaded image can't be automatically verified as a real, successful
// payment of the right amount, so a human always makes the final call.

// GET /api/stores/subscription-qr  (any authenticated store_admin)
// Returns the platform's own UPI QR code image + UPI id, so the store owner
// knows where to pay their annual fee.
router.get('/subscription-qr', requireAuth, requireStoreAdmin, (req, res) => {
  const qr = db.prepare("SELECT value FROM platform_settings WHERE key = 'qr_image_base64'").get();
  const upiId = db.prepare("SELECT value FROM platform_settings WHERE key = 'upi_id'").get();
  res.json({
    qr_image_base64: qr?.value || null,
    upi_id: upiId?.value || null,
  });
});

// POST /api/stores/subscription/submit-proof  (store_admin only)
// body: { screenshot_base64, note? }
// Creates a pending review request. The store's subscription_status is set
// to 'pending_review' so the dashboard can show "awaiting approval" instead
// of a plain "inactive" -- it does NOT activate anything by itself.
router.post('/subscription/submit-proof', requireAuth, requireStoreAdmin, (req, res) => {
  const { screenshot_base64, note } = req.body;
  if (!screenshot_base64) {
    return res.status(400).json({ error: 'screenshot_base64 is required -- upload a screenshot of your payment' });
  }

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.user.store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const requestId = nanoid(12);
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO subscription_payment_requests (id, store_id, screenshot_base64, note, amount, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    ).run(requestId, store.id, screenshot_base64, note || null, store.annual_fee);

    // Only move a fresh/expired store into "pending_review" -- don't
    // downgrade a store that's already active (e.g. renewing early).
    if (store.subscription_status !== 'active') {
      db.prepare("UPDATE stores SET subscription_status = 'pending_review' WHERE id = ?").run(store.id);
    }
  });
  tx();

  res.status(201).json({
    request: db.prepare('SELECT * FROM subscription_payment_requests WHERE id = ?').get(requestId),
    store: publicStore(db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id)),
    message: 'Payment proof submitted. Your subscription will activate once it\u2019s reviewed and approved.',
  });
});

// GET /api/stores/subscription/requests  (store_admin only)
// Lets the store owner see the status of their own submitted proofs.
router.get('/subscription/requests', requireAuth, requireStoreAdmin, (req, res) => {
  const requests = db
    .prepare('SELECT id, note, amount, status, created_at, reviewed_at FROM subscription_payment_requests WHERE store_id = ? ORDER BY created_at DESC')
    .all(req.user.store_id);
  res.json({ requests });
});

module.exports = router;
