// routes/platform.js
// Platform-owner-only actions: reviewing store subscription payment proofs
// and managing the platform's own UPI QR code that stores pay into.
const express = require('express');
const db = require('../db/database');
const { requireAuth, requirePlatformAdmin } = require('../middleware/auth');

const router = express.Router();

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

router.use(requireAuth, requirePlatformAdmin);

// GET /api/platform/subscription-requests?status=pending
router.get('/subscription-requests', (req, res) => {
  const status = req.query.status || 'pending';
  const requests = db
    .prepare(
      `SELECT r.*, s.name as store_name, s.owner_email
       FROM subscription_payment_requests r
       JOIN stores s ON s.id = r.store_id
       WHERE r.status = ?
       ORDER BY r.created_at ASC`
    )
    .all(status);
  res.json({ requests });
});

// POST /api/platform/subscription-requests/:id/approve
// Activates (or extends) the store's subscription by one year from whichever
// is later: now, or its current expiry (so an early renewal isn't wasted).
// Every approval also raises the store's annual_fee by 10% for next time --
// Year 1 Rs 60,000 -> Year 2 Rs 66,000 -> Year 3 Rs 72,600, compounding.
// This is purely informational (what's shown to the store owner on their
// next payment screen) since payment itself is manual/QR-based -- nothing
// here enforces the customer actually paid the new amount.
const ANNUAL_INCREASE_RATE = 1.10;

router.post('/subscription-requests/:id/approve', (req, res) => {
  const request = db.prepare('SELECT * FROM subscription_payment_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: `This request was already ${request.status}` });

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(request.store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const now = new Date();
  const currentExpiry = store.subscription_expires_at ? new Date(store.subscription_expires_at) : null;
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(base.getTime() + ONE_YEAR_MS);
  const nextYearFee = Math.round(store.annual_fee * ANNUAL_INCREASE_RATE);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE stores
       SET subscription_status = 'active',
           subscription_started_at = COALESCE(subscription_started_at, ?),
           subscription_expires_at = ?,
           annual_fee = ?
       WHERE id = ?`
    ).run(now.toISOString(), newExpiry.toISOString(), nextYearFee, store.id);

    db.prepare(
      `UPDATE subscription_payment_requests SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`
    ).run(req.user.id, request.id);
  });
  tx();

  res.json({
    message: `${store.name}'s subscription is now active until ${newExpiry.toISOString().slice(0, 10)}. Next year's fee: \u20b9${nextYearFee}.`,
    store: db.prepare('SELECT id, name, subscription_status, subscription_expires_at, annual_fee FROM stores WHERE id = ?').get(store.id),
  });
});

// POST /api/platform/subscription-requests/:id/reject  { reason? }
router.post('/subscription-requests/:id/reject', (req, res) => {
  const request = db.prepare('SELECT * FROM subscription_payment_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: `This request was already ${request.status}` });

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE subscription_payment_requests SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`
    ).run(req.user.id, request.id);

    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(request.store_id);
    if (store && store.subscription_status === 'pending_review') {
      db.prepare("UPDATE stores SET subscription_status = 'inactive' WHERE id = ?").run(store.id);
    }
  });
  tx();

  res.json({ message: 'Request rejected. The store owner can resubmit with a new screenshot.' });
});

// POST /api/platform/qr-code  { image_base64, upi_id }
// Sets/replaces the platform's own payment QR shown to every store owner.
router.post('/qr-code', (req, res) => {
  const { image_base64, upi_id } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });

  const upsert = db.prepare(
    `INSERT INTO platform_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  upsert.run('qr_image_base64', image_base64);
  if (upi_id) upsert.run('upi_id', upi_id);

  res.json({ message: 'Platform QR code updated.' });
});

module.exports = router;
