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
const { sendCustomerWelcomeEmail, sendOtpEmail } = require('../utils/email');
const { createOtp, verifyAndConsumeOtp, OTP_TTL_MINUTES } = require('../utils/otp');

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

  sendCustomerWelcomeEmail(user.email, user.name, store.name).catch(() => {});

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id },
    store: { id: store.id, name: store.name },
  });
});

// POST /api/auth/login
// body: { identifier, password }  -- identifier can be an email or a phone
// number; also accepts { email, password } for backwards compatibility.
// Looks the account up by whichever one was actually entered.
router.post('/login', (req, res) => {
  const identifier = (req.body.identifier || req.body.email || '').trim();
  const { password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'email/phone and password are required' });
  }

  const looksLikeEmail = identifier.includes('@');
  const user = looksLikeEmail
    ? db.prepare('SELECT * FROM users WHERE email = ?').get(identifier.toLowerCase())
    : db.prepare('SELECT * FROM users WHERE phone = ?').get(identifier);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email/phone or password' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, store_id: user.store_id } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, name, email, phone, role, store_id FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// PATCH /api/auth/me  { email?, password?, current_password }
// Lets a logged-in user change their own login email and/or password --
// but NOT for store_admin accounts. A store owner's email is deliberately
// permanent (see routes/stores.js) so one owner can't quietly free up their
// email to register a second store; letting them change it here later would
// undermine that. Platform admins and customers have no such restriction --
// this is primarily how you (the platform admin) move off the seeded demo
// email once you're ready to use your own, without needing to touch the
// database directly or wipe existing data by reseeding.
router.patch('/me', requireAuth, (req, res) => {
  if (req.user.role === 'store_admin') {
    return res.status(403).json({
      error: 'Store owner accounts cannot change their login email -- it is permanently tied to your store registration.',
    });
  }

  const { email, password, current_password } = req.body;
  if (!email && !password) {
    return res.status(400).json({ error: 'Provide a new email and/or password to update' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!current_password || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'current_password is incorrect' });
  }

  const updates = {};
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(normalizedEmail, user.id);
    if (existing) return res.status(409).json({ error: 'Another account already uses this email' });
    updates.email = normalizedEmail;
  }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    updates.password_hash = bcrypt.hashSync(password, 10);
  }

  const setClause = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...Object.values(updates), user.id);

  const updated = db.prepare('SELECT id, name, email, phone, role, store_id FROM users WHERE id = ?').get(user.id);
  const token = signToken(updated);
  res.json({ token, user: updated, message: 'Login details updated.' });
});

// ---- Forgot password (not logged in) ----
// Two-step: request a code emailed to the account's registered address,
// then submit that code + a new password to actually reset it.

// POST /api/auth/forgot-password/request  { identifier }
// Always responds with the same generic message regardless of whether the
// identifier matched a real account -- this avoids letting someone probe
// which emails/phones have accounts just by watching the response differ.
router.post('/forgot-password/request', (req, res) => {
  const identifier = (req.body.identifier || '').trim();
  if (!identifier) return res.status(400).json({ error: 'identifier is required' });

  const looksLikeEmail = identifier.includes('@');
  const user = looksLikeEmail
    ? db.prepare('SELECT * FROM users WHERE email = ?').get(identifier.toLowerCase())
    : db.prepare('SELECT * FROM users WHERE phone = ?').get(identifier);

  if (user && user.email) {
    const code = createOtp(user.id, 'forgot');
    sendOtpEmail(user.email, code, 'forgot').catch(() => {});
  }

  res.json({
    message: 'If an account exists for that email/phone, a verification code has been emailed to its registered address.',
  });
});

// POST /api/auth/forgot-password/reset  { identifier, otp, new_password }
router.post('/forgot-password/reset', (req, res) => {
  const identifier = (req.body.identifier || '').trim();
  const { otp, new_password } = req.body;
  if (!identifier || !otp || !new_password) {
    return res.status(400).json({ error: 'identifier, otp and new_password are required' });
  }
  if (new_password.length < 6) return res.status(400).json({ error: 'new_password must be at least 6 characters' });

  const looksLikeEmail = identifier.includes('@');
  const user = looksLikeEmail
    ? db.prepare('SELECT * FROM users WHERE email = ?').get(identifier.toLowerCase())
    : db.prepare('SELECT * FROM users WHERE phone = ?').get(identifier);

  if (!user || !verifyAndConsumeOtp(user.id, 'forgot', otp)) {
    return res.status(400).json({ error: 'That code is invalid or has expired. Please request a new one.' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), user.id);
  res.json({ message: 'Password reset. You can now log in with your new password.' });
});

// ---- Change password (logged in, with an extra OTP verification step) ----
// Works for any role (customer, store_admin, platform_admin) -- unlike
// PATCH /me above, this only ever touches the password, never the email,
// so it doesn't need the store_admin restriction that endpoint has.

// POST /api/auth/password/request-otp  (authenticated)
router.post('/password/request-otp', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.email) {
    return res.status(400).json({ error: 'Your account has no registered email to send a code to.' });
  }
  const code = createOtp(user.id, 'change');
  sendOtpEmail(user.email, code, 'change').catch(() => {});
  res.json({ message: `A verification code was sent to ${user.email}. It expires in ${OTP_TTL_MINUTES} minutes.` });
});

// POST /api/auth/password/change  (authenticated)  { current_password, new_password, otp }
router.post('/password/change', requireAuth, (req, res) => {
  const { current_password, new_password, otp } = req.body;
  if (!current_password || !new_password || !otp) {
    return res.status(400).json({ error: 'current_password, new_password and otp are all required' });
  }
  if (new_password.length < 6) return res.status(400).json({ error: 'new_password must be at least 6 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'current_password is incorrect' });
  }
  if (!verifyAndConsumeOtp(user.id, 'change', otp)) {
    return res.status(400).json({ error: 'That verification code is invalid or has expired. Please request a new one.' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), user.id);
  res.json({ message: 'Password changed successfully.' });
});

module.exports = router;
