// db/seed.js
// Populates the database with the real Kudrati Kahumbo store (active
// subscription), its full menu -- taken directly from the brand's own menu
// PDF -- a store-admin account, and a demo customer already registered
// within that store's service radius, so the app is immediately usable
// after `npm run seed`.

const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const db = require('./database');
const placeholderQr = require('./placeholderQr');
const itemImages = require('./itemImages');

const id = () => nanoid(12);

// Item name -> photo, for the handful of items the store owner has supplied
// a real product photo for. Everything else gets no image_url (the mobile
// app falls back to a letter-initial placeholder for those, see
// mobile/src/components/MenuItemCard.js). Add more names here as more
// photos come in -- addItem/addSizedItem below both look this up
// automatically, no other code needs to change.
const ITEM_IMAGE_BY_NAME = {
  'Jamun Shot': itemImages.jamun_shot,
  'Pop Shots Combo (Any 6 Flavours, on stick)': itemImages.pop_shots,
  'Guava Fruit': itemImages.guava_frost,
  'Pineapple Fruit': itemImages.pineapple_frost,
  'Orange Fruit': itemImages.orange_frost,
  'Mango Shot': itemImages.mango_promo,
  'Caramel Latte Iced Coffee': itemImages.ice_latte,
};

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

  const categoryNames = [
    'Fruit Shots',
    'Refreshing Drinks',
    'Fruit Juices',
    'Fruit Dish',
    'Unique Mocktails',
    'Milkshakes',
    'Coffee',
    'Something Hot',
    'Chocolate Shakes',
    'Millet Shakes',
    'Fruity Frosts',
    'Rollcut Fruit Kulfis',
    'Combos',
  ];
  const categories = {};
  const insertCategory = db.prepare(
    'INSERT INTO categories (id, store_id, name, sort_order) VALUES (?, ?, ?, ?)'
  );
  categoryNames.forEach((name, i) => {
    const catId = id();
    categories[name] = catId;
    insertCategory.run(catId, storeId, name, i + 1);
  });

  const insertItem = db.prepare(`
    INSERT INTO menu_items (id, store_id, category_id, name, description, base_price, image_url, is_available, is_veg)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const insertGroup = db.prepare(`
    INSERT INTO option_groups (id, menu_item_id, name, min_select, max_select, required)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertChoice = db.prepare(`
    INSERT INTO option_choices (id, group_id, name, price_delta) VALUES (?, ?, ?, ?)
  `);

  // Everything on this menu is vegetarian.
  function addItem(categoryName, name, price, description = '') {
    insertItem.run(id(), storeId, categories[categoryName], name, description, price, ITEM_IMAGE_BY_NAME[name] || null, 1);
  }

  // For items sold in two sizes (e.g. Fruit Shots' 70ml-4pcs vs Big Shot, or
  // Fruity Frosts' 100gm vs 200gm) -- base_price is the first size, and a
  // "Size" option group covers the rest via price_delta, same pattern as a
  // pizza's size options.
  function addSizedItem(categoryName, name, sizes, description = '') {
    const basePrice = sizes[0][1];
    const itemId = id();
    insertItem.run(itemId, storeId, categories[categoryName], name, description, basePrice, ITEM_IMAGE_BY_NAME[name] || null, 1);
    if (sizes.length > 1) {
      const groupId = id();
      insertGroup.run(groupId, itemId, 'Size', 1, 1, 1);
      sizes.forEach(([label, price]) => insertChoice.run(id(), groupId, label, price - basePrice));
    }
  }

  // ---- Fruit Shots (70ml *4pcs / Big Shot 100ml where available) ----
  addSizedItem('Fruit Shots', 'Litchi Shot', [['70ml (4pcs)', 230], ['Big Shot (100ml)', 90]]);
  addSizedItem('Fruit Shots', 'Chocolate Shot', [['70ml (4pcs)', 190], ['Big Shot (100ml)', 80]]);
  addSizedItem('Fruit Shots', 'Guava Regular Shot', [['70ml (4pcs)', 190], ['Big Shot (100ml)', 80]]);
  addSizedItem('Fruit Shots', 'Guava Spicy Shot', [['70ml (4pcs)', 210], ['Big Shot (100ml)', 80]]);
  addSizedItem('Fruit Shots', 'Jamun Shot', [['70ml (4pcs)', 200], ['Big Shot (100ml)', 80]]);
  addSizedItem('Fruit Shots', 'Strawberry Shot', [['70ml (4pcs)', 190], ['Big Shot (100ml)', 80]]);
  addSizedItem('Fruit Shots', 'Kiwi Shot', [['70ml (4pcs)', 210], ['Big Shot (100ml)', 80]]);
  addItem('Fruit Shots', 'Sitafal Shot', 230);
  addItem('Fruit Shots', 'Paan Shot', 190);
  addItem('Fruit Shots', 'Falsa Shot', 210);
  addItem('Fruit Shots', 'Mango Shot', 210);

  // ---- Refreshing Drinks (300ml) ----
  [
    'Classic Mint Mojito',
    'Watermelon Mojito',
    'Green Apple Mojito',
    'Strawberry Mojito',
    'Tangy Mango Mojito',
    'Spiced Mint Mojito',
    'Zesty Lemon Ice Tea',
    'Rose Mint Blue Fusion Ice Tea',
    'Hibiscus Bloom Ice Tea',
    'Peach Breeze Ice Tea',
    'Crisp Apple Ice Tea',
  ].forEach((n) => addItem('Refreshing Drinks', n, 150, '300ml'));

  // ---- Fruit Juices (300ml) ----
  addItem('Fruit Juices', 'Litchi Juice', 170, '300ml');
  addItem('Fruit Juices', 'Mango Juice', 170, '300ml');
  addItem('Fruit Juices', 'Kiwi Juice', 170, '300ml');
  addItem('Fruit Juices', 'Strawberry Juice', 170, '300ml');
  addItem('Fruit Juices', 'Jamun Juice', 170, '300ml');
  addItem('Fruit Juices', 'Watermelon Juice', 160, '300ml');
  addItem('Fruit Juices', 'Orange Juice', 170, '300ml');
  addItem('Fruit Juices', 'Pineapple Juice', 170, '300ml');
  addItem('Fruit Juices', 'Guava Juice', 160, '300ml');
  addItem('Fruit Juices', 'Falsa Juice', 170, '300ml');
  addItem('Fruit Juices', 'Orange + Pineapple Juice', 170, '300ml');
  addItem('Fruit Juices', 'Watermelon + Strawberry Juice', 170, '300ml');

  // ---- Fruit Dish ----
  addItem('Fruit Dish', 'Fruit Dish', 250, '300gm');

  // ---- Unique Mocktails (300ml) ----
  addItem('Unique Mocktails', 'Bluewave Refresher', 170, '300ml');
  addItem('Unique Mocktails', 'Tropic Guava Rush', 170, '300ml');
  addItem('Unique Mocktails', 'Dusk Delight', 170, '300ml');
  addItem('Unique Mocktails', 'Red Ember Cooler', 170, '300ml');
  addItem('Unique Mocktails', 'Flaming Guava Twist', 170, '300ml');
  addItem('Unique Mocktails', 'Masala Citrus Rush (Lemonade)', 170, '300ml');
  addItem('Unique Mocktails', 'Tangy Aam Burst (Masala Kachha Aam)', 170, '300ml');
  addItem('Unique Mocktails', 'Classic Lemon Fusion (Shiknaji Drink)', 170, '300ml');
  addItem('Unique Mocktails', 'Purple Ice Elixir (Kala Khatta)', 170, '300ml');
  addItem('Unique Mocktails', 'Alphonso Fire Twist', 170, '300ml');
  addItem('Unique Mocktails', 'Hibiscus Bloom', 170, '300ml');

  // ---- Milkshakes (300ml) ----
  addItem('Milkshakes', 'Strawberry Bliss Shake', 210, '300ml');
  addItem('Milkshakes', 'Golden Mango Bliss Shake', 210, '300ml');
  addItem('Milkshakes', 'Sapota (Chiku) Bliss Shake', 190, '300ml');
  addItem('Milkshakes', 'Royal Cashew Fig (Kaju Anjir) Bliss Shake', 250, '300ml');
  addItem('Milkshakes', 'Mixberry Fusion Bliss Shake', 210, '300ml');
  addItem('Milkshakes', 'Saffron Cardamom Fusion Bliss Shake', 190, '300ml');
  addItem('Milkshakes', 'Date Rose Petals (Gulkand) Bliss Shake', 230, '300ml');
  addItem('Milkshakes', 'Custard Apple Bliss Shake', 230, '300ml');
  addItem('Milkshakes', 'Mango Avocado Fusion Shake', 250, '300ml');
  addItem('Milkshakes', 'Banana Avocado Fusion Shake', 250, '300ml');
  addItem('Milkshakes', 'Strawberry Avocado Fusion Shake', 250, '300ml');
  addItem('Milkshakes', 'Mix Berry Avocado Fusion Shake', 250, '300ml');

  // ---- Coffee (300ml) ----
  addItem('Coffee', 'Iced Coffee Classic', 160, '300ml');
  addItem('Coffee', 'Mocha Iced Coffee', 170, '300ml');
  addItem('Coffee', 'Caramel Latte Iced Coffee', 170, '300ml');
  addItem('Coffee', 'Creamy Iced Coffee', 190, '300ml');

  // ---- Something Hot (150ml) ----
  addItem('Something Hot', 'Hot Chocolate Classic', 160, '150ml');
  addItem('Something Hot', 'Hot Jaggery Base Chocolate', 180, '150ml');
  addItem('Something Hot', 'Hot Indian Classic Coffee', 140, '150ml');
  addItem('Something Hot', 'Hot Latte Coffee', 150, '150ml');
  addItem('Something Hot', 'Hot Mocha Coffee', 150, '150ml');
  addItem('Something Hot', 'Classic Filter Coffee', 170, '150ml');

  // ---- Chocolate Shakes (300ml) ----
  addItem('Chocolate Shakes', 'Creamy Crunch Milkshake', 210, '300ml');
  addItem('Chocolate Shakes', 'Kitkat Milkshake', 210, '300ml');
  addItem('Chocolate Shakes', 'Ferrero Rocher Royal Milkshake', 230, '300ml');
  addItem('Chocolate Shakes', 'Nutella Milkshake', 210, '300ml');
  addItem('Chocolate Shakes', 'Chocolate Brownie Milkshake', 220, '300ml');
  addItem('Chocolate Shakes', 'Choco Cream Classic Milkshake', 190, '300ml');
  addItem('Chocolate Shakes', 'Classic Cold Coco', 210, '300ml');
  addItem('Chocolate Shakes', 'Italian Dessert (Tiramisu) Milkshake', 210, '300ml');
  addItem('Chocolate Shakes', 'Biscoff Cream Milkshake', 250, '300ml');

  // ---- Millet Shakes (300ml) ----
  addItem('Millet Shakes', 'Millet Chocolate Milkshake', 250, '300ml');
  addItem('Millet Shakes', 'Millet Mango Milkshake', 250, '300ml');
  addItem('Millet Shakes', 'Millet Strawberry Milkshake', 260, '300ml');
  addItem('Millet Shakes', 'Millet Caramel Banana Milkshake', 250, '300ml');
  addItem('Millet Shakes', 'Millet Berry Banana Milkshake', 260, '300ml');
  addItem('Millet Shakes', 'Millet Sapota (Chiku) Chocolate Milkshake', 260, '300ml');
  addItem('Millet Shakes', 'Millet Custard Apple Milkshake', 260, '300ml');
  addItem('Millet Shakes', 'Millet Fig and Cashew (Kaju Anjir) Milkshake', 270, '300ml');

  // ---- Fruity Frosts (100gm / 200gm) ----
  addSizedItem('Fruity Frosts', 'Orange Fruit', [['100gm', 130], ['200gm', 230]]);
  addSizedItem('Fruity Frosts', 'Guava Fruit', [['100gm', 130], ['200gm', 230]]);
  addItem('Fruity Frosts', 'Pineapple Fruit', 230, '200gm');
  addSizedItem('Fruity Frosts', 'Musk Melon Fruit (Seasonal)', [['100gm', 130], ['200gm', 230]]);
  addSizedItem('Fruity Frosts', 'Mango Fruit', [['100gm', 140], ['200gm', 250]]);

  // ---- Rollcut Fruit Kulfis (100ml) ----
  [
    'Jamun Kulfi',
    'Kiwi Kulfi',
    'Sitafal Kulfi',
    'Coconut Kulfi',
    'Mango Kulfi',
    'Black Grape Kulfi',
    'Paan Kulfi',
    'Strawberry Kulfi',
    'Litchi Kulfi',
  ].forEach((n) => addItem('Rollcut Fruit Kulfis', n, 130, '100ml'));

  // ---- Combos ----
  addItem(
    'Combos',
    'Pop Shots Combo (Any 6 Flavours, on stick)',
    140,
    'Choose any 6: Jamun, Falsa, Guava, Strawberry, Chikoo, Mango, Chocolate, Paan, Pista, Rose Gulakand, Coconut, Mava Malai'
  );

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
