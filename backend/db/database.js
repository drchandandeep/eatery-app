// db/database.js
// Central SQLite connection + schema setup. Uses better-sqlite3 (synchronous,
// zero-config, file-based) so the whole backend runs with no external
// database server -- perfect for getting an MVP running fast.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB_PATH is configurable via an environment variable so the database file
// can live on a persistent disk (see Render's "Disks" feature) instead of
// the container's local filesystem, which resets on every restart/redeploy.
// Falls back to a local file for local development, where that's fine.
// See README.md's "Persistent storage" section for the Render setup steps
// -- this single line is the only thing that changes to use it.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'kahumbo.db');

// If DB_PATH points into a directory that doesn't exist yet (e.g. a fresh
// persistent disk mount), create it -- better-sqlite3 won't create missing
// parent directories itself.
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
-- One row per registered store/eatery. A store is the paying tenant of the
-- platform. owner_email + the address captured at registration are
-- permanent: there is no UPDATE path for either, anywhere in the API, by
-- design (see routes/stores.js). This stops one owner from registering once
-- and then re-pointing the same account at a different physical location to
-- dodge paying for a second store.
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT UNIQUE NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT,
  zip TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  service_radius_km REAL NOT NULL DEFAULT 7,   -- customers must be within this to sign up / order (range 5-10, see backend/utils/config.js)
  annual_fee REAL NOT NULL DEFAULT 60000.00, -- increases 10% on every approved renewal, see routes/platform.js
  subscription_status TEXT NOT NULL DEFAULT 'inactive', -- 'inactive' | 'active' | 'expired' | 'pending_review'
  subscription_started_at TEXT,
  subscription_expires_at TEXT,
  -- Daily operating hours, 24h 'HH:MM' in IST (this app is India-only, so we
  -- don't store a timezone -- see utils/storeStatus.js). Orders are blocked
  -- outside this window regardless of the manual toggle below.
  opens_at TEXT NOT NULL DEFAULT '12:00',
  closes_at TEXT NOT NULL DEFAULT '20:00',
  -- Independent manual kill-switch the store owner flips from their admin
  -- dashboard (e.g. "too busy, pause new orders for an hour") -- separate
  -- from the scheduled hours above so either one alone can close the store.
  accepting_orders INTEGER NOT NULL DEFAULT 1,
  -- The store's own UPI QR code, uploaded by the store owner, shown to
  -- customers at checkout as a "pay via QR" option (see routes/orders.js).
  -- There is no payment gateway here -- customers scan this in their own
  -- UPI app and confirm "I've paid" in-app; the store owner is the one who
  -- actually knows the money landed, same trust model as the platform's own
  -- subscription QR (see subscription_payment_requests) but without a
  -- formal review step, since it's the store's own money at stake, not the
  -- platform's.
  order_qr_image_base64 TEXT,
  order_upi_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer', -- 'customer' | 'store_admin'
  -- The store a customer (or store_admin) belongs to. Set once at signup and
  -- never changed thereafter -- see routes/auth.js and routes/stores.js.
  store_id TEXT REFERENCES stores(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT,
  zip TEXT,
  lat REAL,
  lng REAL,
  is_default INTEGER DEFAULT 0,
  -- The address captured at signup that was used to prove the customer is
  -- within the store's service radius. Locked forever (see routes/auth.js).
  is_registration_address INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_price REAL NOT NULL,
  image_url TEXT,
  is_available INTEGER DEFAULT 1,
  is_veg INTEGER DEFAULT 1
);

-- Customization groups, e.g. "Size", "Crust", "Toppings"
CREATE TABLE IF NOT EXISTS option_groups (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_select INTEGER DEFAULT 0,
  max_select INTEGER DEFAULT 1,
  required INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS option_choices (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'placed',
  -- placed -> confirmed -> preparing -> out_for_delivery -> delivered  (or cancelled)
  subtotal REAL NOT NULL,
  delivery_fee REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  address_line TEXT,
  -- 'cash' (Cash on Delivery, Cash/UPI at the door) | 'qr' (customer pays
  -- via the store's own uploaded QR code and confirms in-app). Neither is
  -- automatically verified -- there's no payment gateway in this app; the
  -- store owner confirms receipt themselves when advancing order status.
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid'
  payment_gateway TEXT, -- unused now (no gateway), kept for schema stability
  payment_ref TEXT, -- unused now, kept for schema stability
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  selected_options TEXT -- JSON string snapshot of chosen options
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simple key/value store for platform-wide settings that aren't worth their
-- own table -- currently just the platform's own UPI QR code (base64 image)
-- that store owners pay their annual subscription to.
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- A store owner's claim that they've paid their annual subscription,
-- evidenced by an uploaded payment-screenshot. Nothing here is trusted
-- automatically -- a platform_admin has to actually look at the screenshot
-- and approve it (see routes/platform.js) before the store's subscription
-- is activated. This is the deliberate, honest alternative to a "trust the
-- image blindly" auto-activation, which would be trivial to fake.
CREATE TABLE IF NOT EXISTS subscription_payment_requests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  screenshot_base64 TEXT NOT NULL,
  note TEXT,
  amount REAL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by TEXT
);

-- One-time codes emailed to a user's registered address, for two flows:
-- 'forgot' (not logged in, resetting a lost password) and 'change' (logged
-- in, changing password with an extra verification step). purpose keeps
-- the two from being interchangeable -- a code requested for one flow
-- can't be used to complete the other.
CREATE TABLE IF NOT EXISTS password_otps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL, -- 'forgot' | 'change'
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Safe, idempotent migration: databases created before payment tracking was
// added won't have these columns yet. ALTER TABLE ADD COLUMN throws if the
// column already exists -- that's expected on every startup after the first
// and is silently ignored, so this is harmless to run every time.
for (const stmt of [
  "ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'",
  'ALTER TABLE orders ADD COLUMN payment_gateway TEXT',
  'ALTER TABLE orders ADD COLUMN payment_ref TEXT',
  'ALTER TABLE orders ADD COLUMN estimated_delivery_minutes INTEGER',
  'ALTER TABLE users ADD COLUMN phone TEXT',
  "ALTER TABLE stores ADD COLUMN opens_at TEXT NOT NULL DEFAULT '12:00'",
  "ALTER TABLE stores ADD COLUMN closes_at TEXT NOT NULL DEFAULT '20:00'",
  'ALTER TABLE stores ADD COLUMN accepting_orders INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE stores ADD COLUMN order_qr_image_base64 TEXT',
  'ALTER TABLE stores ADD COLUMN order_upi_id TEXT',
]) {
  try {
    db.exec(stmt);
  } catch (err) {
    // Column already exists -- fine, nothing to do.
  }
}

module.exports = db;
