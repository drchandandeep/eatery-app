// routes/payments.js
// Online payments (UPI, netbanking, cards, wallets) via Razorpay. Cash
// orders skip this entirely and go straight through POST /api/orders.
//
// Flow:
//   1. Client calls POST /payments/create-order with the cart.
//      We recompute the real total server-side and open a Razorpay order
//      for that exact amount -- the client can never dictate the price.
//   2. Client completes checkout in Razorpay's UI (web script or the
//      mobile WebView bridge) and gets back a payment id + signature.
//   3. Client calls POST /payments/verify-and-place-order with those plus
//      the same cart. We verify the signature ourselves using the secret
//      key (never trust the client's word that payment succeeded), then
//      -- only on success -- actually write the order to the database.
const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { effectiveStoreStatus } = require('../utils/subscription');
const orders = require('./orders');

const router = express.Router();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

let razorpay = null;
function getRazorpayClient() {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return null;
  if (!razorpay) {
    // Lazy-required so the whole server doesn't crash on startup if the
    // package isn't installed yet or keys aren't configured -- online
    // payments just won't be available until both are set up.
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  }
  return razorpay;
}

function assertCustomerWithActiveStore(req) {
  if (req.user.role !== 'customer' || !req.user.store_id) {
    const err = new Error('Only customer accounts linked to a store can place orders');
    err.status = 403;
    throw err;
  }
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.user.store_id);
  if (!store || effectiveStoreStatus(store) !== 'active') {
    const err = new Error('This store is temporarily unavailable for ordering (subscription inactive). Please check back later.');
    err.status = 402;
    throw err;
  }
  return store;
}

// POST /api/payments/create-order
// body: { items, address_line }  (address_line isn't used for pricing, just
// carried through so the client doesn't have to resend it twice)
router.post('/create-order', requireAuth, async (req, res) => {
  try {
    assertCustomerWithActiveStore(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const client = getRazorpayClient();
  if (!client) {
    return res.status(500).json({
      error: 'Online payments are not configured on this server yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the backend .env file.',
    });
  }

  let totals;
  try {
    totals = orders.computeOrderTotals(req.body.items, req.user.store_id);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const amountPaise = Math.round(totals.total * 100); // Razorpay amounts are in the smallest currency unit (paise)
    const razorpayOrder = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `order_${Date.now()}`,
      notes: { store_id: req.user.store_id, user_id: req.user.id },
    });

    res.json({
      razorpay_order_id: razorpayOrder.id,
      amount: amountPaise,
      currency: 'INR',
      key_id: RAZORPAY_KEY_ID,
      total: totals.total,
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not start the payment. Please try again.' });
  }
});

// POST /api/payments/verify-and-place-order
// body: { items, address_line, razorpay_order_id, razorpay_payment_id, razorpay_signature }
router.post('/verify-and-place-order', requireAuth, (req, res) => {
  try {
    assertCustomerWithActiveStore(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const { items, address_line, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification details' });
  }
  if (!RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Online payments are not configured on this server yet.' });
  }

  // This is the actual security check: Razorpay signs order_id + payment_id
  // with our secret key. If what the client sent doesn't match what we
  // compute ourselves, either the payment didn't really succeed or the
  // values were tampered with in transit -- either way, don't create the order.
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({
      error: 'Payment verification failed. If money was deducted, Razorpay will auto-refund it within a few days.',
    });
  }

  let totals;
  try {
    totals = orders.computeOrderTotals(items, req.user.store_id);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const order = orders.insertOrderRecord({
    storeId: req.user.store_id,
    userId: req.user.id,
    totals,
    addressLine: address_line,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    paymentGateway: 'razorpay',
    paymentRef: razorpay_payment_id,
  });

  res.status(201).json({ order });
});

module.exports = router;
