// routes/platform.js
// Platform-owner-only actions: reviewing store subscription payment proofs
// and managing the platform's own UPI QR code that stores pay into.
const express = require('express');
const db = require('../db/database');
const { requireAuth, requirePlatformAdmin } = require('../middleware/auth');
const { sendSubscriptionApprovedEmail, sendSubscriptionRejectedEmail } = require('../utils/email');

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

  sendSubscriptionApprovedEmail(store.owner_email, store.name, newExpiry.toISOString()).catch(() => {});

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

  let store = null;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE subscription_payment_requests SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`
    ).run(req.user.id, request.id);

    store = db.prepare('SELECT * FROM stores WHERE id = ?').get(request.store_id);
    if (store && store.subscription_status === 'pending_review') {
      db.prepare("UPDATE stores SET subscription_status = 'inactive' WHERE id = ?").run(store.id);
    }
  });
  tx();

  if (store) sendSubscriptionRejectedEmail(store.owner_email, store.name).catch(() => {});

  res.json({ message: 'Request rejected. The store owner can resubmit with a new screenshot.' });
});

// GET /api/platform/qr-code
// Lets the platform admin see their currently-set QR (if any) before
// deciding whether to upload a first one or replace an existing one --
// used to drive the "ask to upload if missing, offer to change if present"
// flow on both the /admin web page and the mobile PlatformAdminScreen.
router.get('/qr-code', (req, res) => {
  const qr = db.prepare("SELECT value FROM platform_settings WHERE key = 'qr_image_base64'").get();
  const upiId = db.prepare("SELECT value FROM platform_settings WHERE key = 'upi_id'").get();
  res.json({ image_base64: qr?.value || null, upi_id: upiId?.value || null });
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

// GET /api/platform/reports
// Platform-wide totals (stores, orders, revenue) plus a per-store list so
// the /admin page and mobile Platform Admin screen can offer a "view one
// store's numbers" dropdown without a separate round trip per store.
// Revenue excludes cancelled orders -- a cancelled order was never really
// collected. Orders count includes every order regardless of status, since
// "how many orders has this store received" is a different, still-useful
// question from "how much did it actually make".
router.get('/reports', (req, res) => {
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM stores) as total_stores,
         (SELECT COUNT(*) FROM orders) as total_orders,
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status != 'cancelled') as total_revenue`
    )
    .get();

  const stores = db
    .prepare(
      `SELECT
         s.id, s.name, s.subscription_status, s.annual_fee,
         (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) as order_count,
         (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.store_id = s.id AND o.status != 'cancelled') as revenue
       FROM stores s
       ORDER BY s.name ASC`
    )
    .all();

  res.json({ totals, stores });
});

// GET /api/platform/reports/:storeId
// Same shape as one row of the list above, but for a single store, plus a
// small recent-orders list -- used when the platform admin picks a
// specific store from the dropdown.
router.get('/reports/:storeId', (req, res) => {
  const store = db.prepare('SELECT id, name, subscription_status, annual_fee FROM stores WHERE id = ?').get(req.params.storeId);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as order_count,
         COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue
       FROM orders WHERE store_id = ?`
    )
    .get(store.id);

  const recentOrders = db
    .prepare('SELECT id, status, total, payment_method, created_at FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(store.id);

  res.json({ store, ...totals, recent_orders: recentOrders });
});

module.exports = router;
