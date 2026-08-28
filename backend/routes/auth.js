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
const asyncHandler = require('../utils/asyncHandler');

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
router.post('/signup', asyncHandler(async (req, res) => {
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
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const store = await db.get('SELECT * FROM stores WHERE id = ?', [store_id]);
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

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO users (id, name, email, phone, password_hash, role, store_id)
       VALUES (?, ?, ?, ?, ?, 'customer', ?)`,
      [userId, name, normalizedEmail, phone || null, bcrypt.hashSync(password, 10), store.id]
    );

    await tx.run(
      `INSERT INTO addresses (id, user_id, label, line1, line2, city, zip, lat, lng, is_default, is_registration_address)
       VALUES (?, ?, 'Home', ?, ?, ?, ?, ?, ?, 1, 1)`,
      [addressId, userId, address.line1, address.line2 || null, address.city || null, address.zip || null, Number(address.lat), Number(address.lng)]
    );
  });

  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  const token = signToken(user);

  sendCustomerWelcomeEmail(user.email, user.name, store.name).catch(() => {});

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id },
    store: { id: store.id, name: store.name },
  });
}));

// POST /api/auth/login
// body: { identifier, password }  -- identifier can be an email or a phone
// number; also accepts { email, password } for backwards compatibility.
router.post('/login', asyncHandler(async (req, res) => {
  const identifier = (req.body.identifier || req.body.email || '').trim();
  const { password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'email/phone and password are required' });
  }

  const looksLikeEmail = identifier.includes('@');
  const user = looksLikeEmail
    ? await db.get('SELECT * FROM users WHERE email = ?', [identifier.toLowerCase()])
    : await db.get('SELECT * FROM users WHERE phone = ?', [identifier]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email/phone or password' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, store_id: user.store_id } });
}));

// GET /api/auth/me
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await db.get('SELECT id, name, email, phone, role, store_id FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}));

// PATCH /api/auth/me  { email?, password?, current_password }
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role === 'store_admin') {
    return res.status(403).json({
      error: 'Store owner accounts cannot change their login email -- it is permanently tied to your store registration.',
    });
  }

  const { email, password, current_password } = req.body;
  if (!email && !password) {
    return res.status(400).json({ error: 'Provide a new email and/or password to update' });
  }

  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!current_password || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'current_password is incorrect' });
  }

  const updates = {};
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [normalizedEmail, user.id]);
    if (existing) return res.status(409).json({ error: 'Another account already uses this email' });
    updates.email = normalizedEmail;
  }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    updates.password_hash = bcrypt.hashSync(password, 10);
  }

  const setClause = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
  await db.run(`UPDATE users SET ${setClause} WHERE id = ?`, [...Object.values(updates), user.id]);

  const updated = await db.get('SELECT id, name, email, phone, role, store_id FROM users WHERE id = ?', [user.id]);
  const token = signToken(updated);
  res.json({ token, user: updated, message: 'Login details updated.' });
}));

// ---- Forgot password (not logged in) ----

// POST /api/auth/forgot-password/request  { identifier }
router.post('/forgot-password/request', asyncHandler(async (req, res) => {
  const identifier = (req.body.identifier || '').trim();
  if (!identifier) return res.status(400).json({ error: 'identifier is required' });

  const looksLikeEmail = identifier.includes('@');
  const user = looksLikeEmail
    ? await db.get('SELECT * FROM users WHERE email = ?', [identifier.toLowerCase()])
    : await db.get('SELECT * FROM users WHERE phone = ?', [identifier]);

  if (user && user.email) {
    const code = await createOtp(user.id, 'forgot');
    sendOtpEmail(user.email, code, 'forgot').catch(() => {});
  }

  res.json({
    message: 'If an account exists for that email/phone, a verification code has been emailed to its registered address.',
  });
}));

// POST /api/auth/forgot-password/reset  { identifier, otp, new_password }
router.post('/forgot-password/reset', asyncHandler(async (req, res) => {
  const identifier = (req.body.identifier || '').trim();
  const { otp, new_password } = req.body;
  if (!identifier || !otp || !new_password) {
    return res.status(400).json({ error: 'identifier, otp and new_password are required' });
  }
  if (new_password.length < 6) return res.status(400).json({ error: 'new_password must be at least 6 characters' });

  const looksLikeEmail = identifier.includes('@');
  const user = looksLikeEmail
    ? await db.get('SELECT * FROM users WHERE email = ?', [identifier.toLowerCase()])
    : await db.get('SELECT * FROM users WHERE phone = ?', [identifier]);

  if (!user || !(await verifyAndConsumeOtp(user.id, 'forgot', otp))) {
    return res.status(400).json({ error: 'That code is invalid or has expired. Please request a new one.' });
  }

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(new_password, 10), user.id]);
  res.json({ message: 'Password reset. You can now log in with your new password.' });
}));

// ---- Change password (logged in, with an extra OTP verification step) ----

// POST /api/auth/password/request-otp  (authenticated)
router.post('/password/request-otp', requireAuth, asyncHandler(async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !user.email) {
    return res.status(400).json({ error: 'Your account has no registered email to send a code to.' });
  }
  const code = await createOtp(user.id, 'change');
  sendOtpEmail(user.email, code, 'change').catch(() => {});
  res.json({ message: `A verification code was sent to ${user.email}. It expires in ${OTP_TTL_MINUTES} minutes.` });
}));

// POST /api/auth/password/change  (authenticated)  { current_password, new_password, otp }
router.post('/password/change', requireAuth, asyncHandler(async (req, res) => {
  const { current_password, new_password, otp } = req.body;
  if (!current_password || !new_password || !otp) {
    return res.status(400).json({ error: 'current_password, new_password and otp are all required' });
  }
  if (new_password.length < 6) return res.status(400).json({ error: 'new_password must be at least 6 characters' });

  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'current_password is incorrect' });
  }
  if (!(await verifyAndConsumeOtp(user.id, 'change', otp))) {
    return res.status(400).json({ error: 'That verification code is invalid or has expired. Please request a new one.' });
  }

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(new_password, 10), user.id]);
  res.json({ message: 'Password changed successfully.' });
}));

module.exports = router;
