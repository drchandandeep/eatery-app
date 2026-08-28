// db/seed.js
// Populates the database with the real Kudrati Kahumbo demo store (active
// subscription), the standard Kahumbo menu, a store-admin account, and a
// demo customer already registered within that store's service radius, so
// the app is immediately usable after `npm run seed`.
//
// Safe to re-run: if any stores already exist, it does nothing (see
// storeCount check below) rather than creating duplicates.

require('dotenv').config();
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const db = require('./database');
const placeholderQr = require('./placeholderQr');
const { createStandardMenu } = require('./kahumboMenu');

const id = () => nanoid(12);

async function run() {
  await db.ready; // make sure tables exist before we query/insert

  const storeCountRow = await db.get('SELECT COUNT(*) c FROM stores', []);
  if (storeCountRow.c > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  const storeId = id();
  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  await db.run(
    `INSERT INTO stores
      (id, name, owner_email, address_line, city, zip, lat, lng, service_radius_km, annual_fee,
       subscription_status, subscription_started_at, subscription_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      storeId,
      'Kudrati Kahumbo',
      'owner@kahumbo.app',
      'VIP Road',
      'Zirakpur',
      '140603',
      30.6425,
      76.8173,
      7,
      60000.0,
      now.toISOString(),
      oneYearFromNow.toISOString(),
    ]
  );

  await createStandardMenu(storeId);

  // Store-admin account: owner@kahumbo.app / admin123
  await db.run(
    `INSERT INTO users (id, name, email, phone, password_hash, role, store_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id(), 'Kahumbo Owner', 'owner@kahumbo.app', '0000000000', bcrypt.hashSync('admin123', 10), 'store_admin', storeId]
  );

  // Demo customer, registered ~1.2km from the store (within the 7km radius):
  // customer@kahumbo.app / customer123
  const customerId = id();
  await db.run(
    `INSERT INTO users (id, name, email, phone, password_hash, role, store_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [customerId, 'Casey Customer', 'customer@kahumbo.app', '1111111111', bcrypt.hashSync('customer123', 10), 'customer', storeId]
  );
  await db.run(
    `INSERT INTO addresses (id, user_id, label, line1, city, zip, lat, lng, is_default, is_registration_address)
     VALUES (?, ?, 'Home', ?, ?, ?, ?, ?, 1, 1)`,
    [id(), customerId, 'VIP Road', 'Zirakpur', '140603', 30.647, 76.812]
  );

  // Platform admin -- this is YOUR login (the platform owner, not any one
  // store).
  await db.run(
    `INSERT INTO users (id, name, email, phone, password_hash, role, store_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id(), 'Platform Admin', 'gkgst2026@gmail.com', '9999999999', bcrypt.hashSync('Simi@1287', 10), 'platform_admin', null]
  );

  // Seed a placeholder payment QR so the store owner's subscription screen
  // shows something rather than "not set up yet" on first run.
  await db.run(`INSERT INTO platform_settings (key, value) VALUES ('qr_image_base64', ?)`, [placeholderQr]);

  console.log('Seed complete.');
  console.log('Store admin login    -> email: owner@kahumbo.app        password: admin123');
  console.log('Demo customer        -> email: customer@kahumbo.app     password: customer123');
  console.log('Platform admin login -> email: gkgst2026@gmail.com      password: Simi@1287');
  console.log('Platform admin web page: /admin (login with the platform admin account above)');
  console.log(`Store location: lat 30.6425, lng 76.8173, (service radius 7km)`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
