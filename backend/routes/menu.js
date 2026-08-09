// routes/menu.js
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Menu browsing doesn't strictly require login (e.g. previewing a store
// before signing up), but a logged-in customer should always see their own
// store's menu without having to pass store_id explicitly. This softly
// decodes the token if present, without rejecting the request if it's not.
function softAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // ignore -- treat as anonymous
    }
  }
  next();
}

function resolveStoreId(req) {
  return req.query.store_id || req.user?.store_id || null;
}

// GET /api/menu?store_id=xxx -> categories with nested items for one store
router.get('/', softAuth, (req, res) => {
  const storeId = resolveStoreId(req);
  if (!storeId) {
    return res.status(400).json({ error: 'store_id is required (or log in as a customer of a store)' });
  }

  const categories = db.prepare('SELECT * FROM categories WHERE store_id = ? ORDER BY sort_order').all(storeId);
  const items = db.prepare('SELECT * FROM menu_items WHERE store_id = ? AND is_available = 1').all(storeId);

  const byCategory = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  res.json({ store_id: storeId, categories: byCategory });
});

// GET /api/menu/items/:id -> full detail incl. option groups + choices
router.get('/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const groups = db
    .prepare('SELECT * FROM option_groups WHERE menu_item_id = ?')
    .all(item.id)
    .map((g) => ({
      ...g,
      choices: db.prepare('SELECT * FROM option_choices WHERE group_id = ?').all(g.id),
    }));

  res.json({ item: { ...item, option_groups: groups } });
});

module.exports = router;
