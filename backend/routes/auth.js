// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { haversineKm, isValidCoordinate } = require('../utils/geo');
const { effectiveStoreStatus: effectiveStatus } = require('../utils/subscription');
const { MAX_SERVICE_RADIUS_KM } = require('../utils/config');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, store_id: user.store_id || null },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/signup  (customer signup only -- store owners use
// POST /api/stores/register instead)
// body: { name, email, password, phone, store_id,
//         address: { line1, city, zip, lat, lng } }
//
// A customer must pick a specific, already-registered, actively-subscribed
// store and prove (via their address coordinates) that they're within that
// store's service area. The store_id and the registration address are then
// permanent on this account -- there's no endpoint to change either, which
// is what keeps "this account belongs to this one store" true over time.
router.post('/signup', (req, res) => {
  const { name, email, password, phone, store_id, address } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (!store_id) {
    return res.status(400).json({ error: 'store_id is required -- pick a store from the nearby list' });
  }
  if (!address || !address.line1 || !isValidCoordinate(Number(address.lat), Number(address.lng))) {
    return res.status(400).json({
      error: 'A delivery address with a valid location (lat/lng) is required to verify you are within range of the store',
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  if (effectiveStatus(store) !== 'active') {
    return res.status(403).json({ error: 'This store is not currently accepting new customers (subscription inactive).' });
  }

  const distanceKm = haversineKm(Number(address.lat), Number(address.lng), store.lat, store.lng);
  const allowedRadius = Math.min(store.service_radius_km, MAX_SERVICE_RADIUS_KM);
  if (distanceKm > allowedRadius) {
    return res.status(403).json({
      error: `This address is ${distanceKm.toFixed(1)}km from ${store.name}, which is outside its ${allowedRadius}km service area.`,
      distance_km: +distanceKm.toFixed(2),
      allowed_radius_km: allowedRadius,
    });
  }

  const userId = nanoid(12);
  const addressId = nanoid(12);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, store_id)
       VALUES (?, ?, ?, ?, ?, 'customer', ?)`
    ).run(userId, name, normalizedEmail, phone || null, bcrypt.hashSync(password, 10), store.id);

    db.prepare(
      `INSERT INTO addresses (id, user_id, label, line1, line2, city, zip, lat, lng, is_default, is_registration_address)
       VALUES (?, ?, 'Home', ?, ?, ?, ?, ?, ?, 1, 1)`
    ).run(addressId, userId, address.line1, address.line2 || null, address.city || null, address.zip || null, Number(address.lat), Number(address.lng));
  });
  tx();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const token = signToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id },
    store: { id: store.id, name: store.name },
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, name, email, phone, role, store_id FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
