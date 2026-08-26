// db/seed.js
// Populates the database with the real Kudrati Kahumbo demo store (active
// subscription), the standard Kahumbo menu (same menu every store gets --
// see db/kahumboMenu.js), a store-admin account, and a demo customer
// already registered within that store's service radius, so the app is
// immediately usable after `npm run seed`.

const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const db = require('./database');
const placeholderQr = require('./placeholderQr');
const { createStandardMenu } = require('./kahumboMenu');

const id = () => nanoid(12);

function run() {
  const storeCount = db.prepare('SELECT COUNT(*) c FROM stores').get().c;
  if (storeCount > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  // Sample store location: downtown coordinates, subscription pre-activated
  // for one year so the seeded admin can use the app immediately. Update
  // lat/lng to the real outlet's coordinates when you have them.
  const storeId = id();
  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  db.prepare(
    `INSERT INTO stores
      (id, name, owner_email, address_line, city, zip, lat, lng, service_radius_km, annual_fee,
       subscription_status, subscription_started_at, subscription_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  ).run(
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
    oneYearFromNow.toISOString()
  );

  createStandardMenu(storeId);

  // Store-admin account: owner@kahumbo.app / admin123
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, phone, password_hash, role, store_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run(
    id(),
    'Kahumbo Owner',
    'owner@kahumbo.app',
    '0000000000',
    bcrypt.hashSync('admin123', 10),
    'store_admin',
    storeId
  );

  // Demo customer, registered ~1.2km from the store (within the 7km radius):
  // customer@kahumbo.app / customer123
  const customerId = id();
  insertUser.run(
    customerId,
    'Casey Customer',
    'customer@kahumbo.app',
    '1111111111',
    bcrypt.hashSync('customer123', 10),
    'customer',
    storeId
  );
  db.prepare(
    `INSERT INTO addresses (id, user_id, label, line1, city, zip, lat, lng, is_default, is_registration_address)
     VALUES (?, ?, 'Home', ?, ?, ?, ?, ?, 1, 1)`
  ).run(id(), customerId, 'VIP Road', 'Zirakpur', '140603', 30.647, 76.812);

  // Platform admin -- this is YOUR login (the platform owner, not any one
  // store). It reviews subscription payment screenshots and sets the
  // platform's own UPI QR code. Not linked to any store_id.
  insertUser.run(
    id(),
    'Platform Admin',
    'gkgst2026@gmail.com',
    '9999999999',
    bcrypt.hashSync('Simi@1287', 10),
    'platform_admin',
    null
  );

  // Seed a placeholder payment QR so the store owner's subscription screen
  // shows something rather than "not set up yet" on first run. Replace it
  // with your real UPI QR any time from the /admin web page (or the mobile
  // app's Platform Admin screen) -- that upload overwrites this row, it
  // does not create a second one.
  db.prepare(
    `INSERT INTO platform_settings (key, value) VALUES ('qr_image_base64', ?)`
  ).run(placeholderQr);

  console.log('Seed complete.');
  console.log('Store admin login    -> email: owner@kahumbo.app        password: admin123');
  console.log('Demo customer        -> email: customer@kahumbo.app     password: customer123');
  console.log('Platform admin login -> email: gkgst2026@gmail.com      password: Simi@1287');
  console.log('Platform admin web page: /admin (login with the platform admin account above)');
  console.log(`Store location: lat 30.6425, lng 76.8173, (service radius 7km)`);
}

run();
