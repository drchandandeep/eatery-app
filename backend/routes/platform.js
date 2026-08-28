// routes/platform.js
// Platform-owner-only actions: reviewing store subscription payment proofs
// and managing the platform's own UPI QR code that stores pay into.
const express = require('express');
const db = require('../db/database');
const { requireAuth, requirePlatformAdmin } = require('../middleware/auth');
const { sendSubscriptionApprovedEmail, sendSubscriptionRejectedEmail } = require('../utils/email');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

router.use(requireAuth, requirePlatformAdmin);

// GET /api/platform/subscription-requests?status=pending
router.get('/subscription-requests', asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const requests = await db.all(
    `SELECT r.*, s.name as store_name, s.owner_email
     FROM subscription_payment_requests r
     JOIN stores s ON s.id = r.store_id
     WHERE r.status = ?
     ORDER BY r.created_at ASC`,
    [status]
  );
  res.json({ requests });
}));

// POST /api/platform/subscription-requests/:id/approve
const ANNUAL_INCREASE_RATE = 1.10;

router.post('/subscription-requests/:id/approve', asyncHandler(async (req, res) => {
  const request = await db.get('SELECT * FROM subscription_payment_requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: `This request was already ${request.status}` });

  const store = await db.get('SELECT * FROM stores WHERE id = ?', [request.store_id]);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const now = new Date();
  const currentExpiry = store.subscription_expires_at ? new Date(store.subscription_expires_at) : null;
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(base.getTime() + ONE_YEAR_MS);
  const nextYearFee = Math.round(store.annual_fee * ANNUAL_INCREASE_RATE);

  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE stores
       SET subscription_status = 'active',
           subscription_started_at = COALESCE(subscription_started_at, ?),
           subscription_expires_at = ?,
           annual_fee = ?
       WHERE id = ?`,
      [now.toISOString(), newExpiry.toISOString(), nextYearFee, store.id]
    );

    await tx.run(
      `UPDATE subscription_payment_requests SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`,
      [req.user.id, request.id]
    );
  });

  sendSubscriptionApprovedEmail(store.owner_email, store.name, newExpiry.toISOString()).catch(() => {});

  res.json({
    message: `${store.name}'s subscription is now active until ${newExpiry.toISOString().slice(0, 10)}. Next year's fee: \u20b9${nextYearFee}.`,
    store: await db.get('SELECT id, name, subscription_status, subscription_expires_at, annual_fee FROM stores WHERE id = ?', [store.id]),
  });
}));

// POST /api/platform/subscription-requests/:id/reject  { reason? }
router.post('/subscription-requests/:id/reject', asyncHandler(async (req, res) => {
  const request = await db.get('SELECT * FROM subscription_payment_requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: `This request was already ${request.status}` });

  let store = null;
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE subscription_payment_requests SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`,
      [req.user.id, request.id]
    );

    store = await tx.get('SELECT * FROM stores WHERE id = ?', [request.store_id]);
    if (store && store.subscription_status === 'pending_review') {
      await tx.run("UPDATE stores SET subscription_status = 'inactive' WHERE id = ?", [store.id]);
    }
  });

  if (store) sendSubscriptionRejectedEmail(store.owner_email, store.name).catch(() => {});

  res.json({ message: 'Request rejected. The store owner can resubmit with a new screenshot.' });
}));

// GET /api/platform/qr-code
router.get('/qr-code', asyncHandler(async (req, res) => {
  const qr = await db.get("SELECT value FROM platform_settings WHERE key = 'qr_image_base64'", []);
  const upiId = await db.get("SELECT value FROM platform_settings WHERE key = 'upi_id'", []);
  res.json({ image_base64: qr?.value || null, upi_id: upiId?.value || null });
}));

// POST /api/platform/qr-code  { image_base64, upi_id }
// Sets/replaces the platform's own payment QR shown to every store owner.
// This write goes to Turso (persistent), so -- unlike before -- it survives
// Render restarts/redeploys/idling.
router.post('/qr-code', asyncHandler(async (req, res) => {
  const { image_base64, upi_id } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });

  const upsertSql = `INSERT INTO platform_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
  await db.run(upsertSql, ['qr_image_base64', image_base64]);
  if (upi_id) await db.run(upsertSql, ['upi_id', upi_id]);

  res.json({ message: 'Platform QR code updated.' });
}));

// GET /api/platform/reports
router.get('/reports', asyncHandler(async (req, res) => {
  const totals = await db.get(
    `SELECT
       (SELECT COUNT(*) FROM stores) as total_stores,
       (SELECT COUNT(*) FROM orders) as total_orders,
       (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status != 'cancelled') as total_revenue`,
    []
  );

  const stores = await db.all(
    `SELECT
       s.id, s.name, s.subscription_status, s.annual_fee,
       (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) as order_count,
       (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.store_id = s.id AND o.status != 'cancelled') as revenue
     FROM stores s
     ORDER BY s.name ASC`,
    []
  );

  res.json({ totals, stores });
}));

// GET /api/platform/reports/:storeId
router.get('/reports/:storeId', asyncHandler(async (req, res) => {
  const store = await db.get('SELECT id, name, subscription_status, annual_fee FROM stores WHERE id = ?', [req.params.storeId]);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const totals = await db.get(
    `SELECT
       COUNT(*) as order_count,
       COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue
     FROM orders WHERE store_id = ?`,
    [store.id]
  );

  const recentOrders = await db.all(
    'SELECT id, status, total, payment_method, created_at FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 10',
    [store.id]
  );

  res.json({ store, ...totals, recent_orders: recentOrders });
}));

module.exports = router;
