// routes/stores.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth, requireStoreAdmin, JWT_SECRET } = require('../middleware/auth');
const { haversineKm, isValidCoordinate } = require('../utils/geo');

const router = express.Router();

const MAX_SERVICE_RADIUS_KM = 6;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

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

function effectiveStatus(store) {
  if (store.subscription_status === 'active') {
    const expired = !store.subscription_expires_at || new Date(store.subscription_expires_at) < new Date();
    return expired ? 'expired' : 'active';
  }
  return store.subscription_status;
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
    ).run(storeId, store_name, normalizedEmail, address_line, city || null, zip || null, Number(lat), Number(lng), MAX_SERVICE_RADIUS_KM);

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

// GET /api/stores/nearby?lat=&lng=&radius_km=6
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
    if (!Number.isFinite(r) || r <= 0 || r > MAX_SERVICE_RADIUS_KM) {
      return res.status(400).json({ error: `service_radius_km must be between 0 and ${MAX_SERVICE_RADIUS_KM}` });
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

// POST /api/stores/subscribe  (store_admin only)
// Mock annual billing: in production this would confirm a real payment
// (e.g. via Stripe Billing) before flipping the subscription on. Renewing
// before expiry extends from the current expiry date rather than from
// "now", so early renewals aren't wasted.
router.post('/subscribe', requireAuth, requireStoreAdmin, (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.user.store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const now = new Date();
  const currentExpiry = store.subscription_expires_at ? new Date(store.subscription_expires_at) : null;
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(base.getTime() + ONE_YEAR_MS);

  db.prepare(
    `UPDATE stores
     SET subscription_status = 'active',
         subscription_started_at = COALESCE(subscription_started_at, ?),
         subscription_expires_at = ?
     WHERE id = ?`
  ).run(now.toISOString(), newExpiry.toISOString(), store.id);

  res.json({
    store: publicStore(db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id)),
    message: `Subscription active until ${newExpiry.toISOString().slice(0, 10)}. Ordering is free for your customers.`,
  });
});

module.exports = router;
