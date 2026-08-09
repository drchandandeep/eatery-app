// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, role, store_id }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Store owner / manager for a specific store (formerly "admin").
function requireStoreAdmin(req, res, next) {
  if (req.user?.role !== 'store_admin' || !req.user?.store_id) {
    return res.status(403).json({ error: 'Store admin access required' });
  }
  next();
}

// Blocks store-admin actions once the store's annual subscription has
// lapsed. Customers are never charged, so this only ever applies to the
// store_admin side of the API. Also flips a stale 'active' status to
// 'expired' in the DB the moment we notice the expiry date has passed.
function requireActiveSubscription(req, res, next) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.user.store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const now = new Date();
  const expiresAt = store.subscription_expires_at ? new Date(store.subscription_expires_at) : null;
  const lapsed = store.subscription_status !== 'active' || !expiresAt || expiresAt < now;

  if (lapsed) {
    if (store.subscription_status === 'active') {
      db.prepare("UPDATE stores SET subscription_status = 'expired' WHERE id = ?").run(store.id);
    }
    return res.status(402).json({
      error: 'Your annual store subscription is inactive or has expired. Renew to continue.',
      subscription_status: store.subscription_status === 'active' ? 'expired' : store.subscription_status,
    });
  }

  req.store = store;
  next();
}

module.exports = { requireAuth, requireStoreAdmin, requireActiveSubscription, JWT_SECRET };
