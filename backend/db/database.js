// db/database.js
// Async database layer backed by @libsql/client, which speaks to Turso
// (a persistent, hosted SQLite-compatible database) over the network. This
// replaces the old better-sqlite3 setup, which stored the database as a
// single file on Render's local disk -- fine for local dev, but wiped
// every time Render's Free tier restarts/redeploys/goes idle, since Free
// tier has no persistent disk option. Turso's free tier gives a real,
// persistent database with no Render disk needed.
//
// Local development (no TURSO_DATABASE_URL set) still works with zero
// setup: it falls back to a local file (db/kahumbo.db), so you don't need
// a Turso account just to run the app on your own machine.
//
// IMPORTANT DIFFERENCE FROM BEFORE: every database call is now async
// (returns a Promise) because Turso talks to a remote server over the
// network -- unlike better-sqlite3, which read the local file instantly
// and synchronously. Every route file has been updated to `await` these
// calls. If you ever add a new database call, remember to `await` it too.

const { createClient } = require('@libsql/client');
const path = require('path');

const usingTurso = !!process.env.TURSO_DATABASE_URL;

const client = createClient(
  usingTurso
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${path.join(__dirname, 'kahumbo.db')}` }
);

// ---- Low-level helpers -----------------------------------------------
// These mirror better-sqlite3's .get() / .all() / .run(), but async.
//   get(sql, params) -> single row object, or undefined
//   all(sql, params) -> array of row objects
//   run(sql, params) -> { changes, lastInsertRowid }

async function get(sql, params = []) {
  const rs = await client.execute({ sql, args: params });
  return rs.rows[0];
}

async function all(sql, params = []) {
  const rs = await client.execute({ sql, args: params });
  return rs.rows;
}

async function run(sql, params = []) {
  const rs = await client.execute({ sql, args: params });
  return { changes: Number(rs.rowsAffected), lastInsertRowid: rs.lastInsertRowid };
}

// transaction(fn): fn receives a { get, all, run } scoped to a single
// atomic transaction (all-or-nothing, same guarantee the old
// db.transaction(...) gave us). Call it like:
//   await db.transaction(async (tx) => { await tx.run(...); await tx.run(...); });
async function transaction(fn) {
  const tx = await client.transaction('write');
  try {
    const txHandle = {
      get: async (sql, params = []) => {
        const rs = await tx.execute({ sql, args: params });
        return rs.rows[0];
      },
      all: async (sql, params = []) => {
        const rs = await tx.execute({ sql, args: params });
        return rs.rows;
      },
      run: async (sql, params = []) => {
        const rs = await tx.execute({ sql, args: params });
        return { changes: Number(rs.rowsAffected), lastInsertRowid: rs.lastInsertRowid };
      },
    };
    const result = await fn(txHandle);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {
      // transaction may already be closed if commit partly succeeded; ignore
    }
    throw err;
  }
}

// ---- Schema setup -------------------------------------------------------
// Runs once at startup. server.js awaits `ready` before accepting traffic,
// so no request can ever hit the database before the tables exist.

const SCHEMA_STATEMENTS = [
  // One row per registered store/eatery. A store is the paying tenant of the
  // platform. owner_email + the address captured at registration are
  // permanent: there is no UPDATE path for either, anywhere in the API, by
  // design (see routes/stores.js). This stops one owner from registering once
  // and then re-pointing the same account at a different physical location to
  // dodge paying for a second store.
  `CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_email TEXT UNIQUE NOT NULL,
    address_line TEXT NOT NULL,
    city TEXT,
    zip TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    service_radius_km REAL NOT NULL DEFAULT 7,
    annual_fee REAL NOT NULL DEFAULT 60000.00,
    subscription_status TEXT NOT NULL DEFAULT 'inactive',
    subscription_started_at TEXT,
    subscription_expires_at TEXT,
    opens_at TEXT NOT NULL DEFAULT '12:00',
    closes_at TEXT NOT NULL DEFAULT '20:00',
    accepting_orders INTEGER NOT NULL DEFAULT 1,
    order_qr_image_base64 TEXT,
    order_upi_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    store_id TEXT REFERENCES stores(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS addresses (
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
    is_registration_address INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    base_price REAL NOT NULL,
    image_url TEXT,
    is_available INTEGER DEFAULT 1,
    is_veg INTEGER DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS option_groups (
    id TEXT PRIMARY KEY,
    menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_select INTEGER DEFAULT 0,
    max_select INTEGER DEFAULT 1,
    required INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS option_choices (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_delta REAL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'placed',
    subtotal REAL NOT NULL,
    delivery_fee REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    address_line TEXT,
    address_lat REAL,
    address_lng REAL,
    payment_method TEXT DEFAULT 'cash',
    payment_status TEXT NOT NULL DEFAULT 'pending',
    payment_gateway TEXT,
    payment_ref TEXT,
    estimated_delivery_minutes INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    selected_options TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS order_status_history (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS subscription_payment_requests (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    screenshot_base64 TEXT NOT NULL,
    note TEXT,
    amount REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT,
    reviewed_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS password_otps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

// Safe, idempotent migrations for columns added after initial release.
// Errors (column already exists) are expected on every startup after the
// first and are silently ignored.
const MIGRATION_STATEMENTS = [
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
  // Delivery-address coordinates, captured at checkout so every order's
  // actual delivery point (not just the customer's registration address)
  // can be checked against the store's 0-7km radius. See routes/orders.js.
  'ALTER TABLE orders ADD COLUMN address_lat REAL',
  'ALTER TABLE orders ADD COLUMN address_lng REAL',
];

async function initSchema() {
  for (const stmt of SCHEMA_STATEMENTS) {
    await client.execute(stmt);
  }
  for (const stmt of MIGRATION_STATEMENTS) {
    try {
      await client.execute(stmt);
    } catch (err) {
      // Column already exists -- fine, nothing to do.
    }
  }
}

// server.js awaits this before calling app.listen(), so the app never
// starts accepting requests before the schema is ready.
const ready = initSchema();

module.exports = { get, all, run, transaction, ready, client, usingTurso };
