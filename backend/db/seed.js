// db/seed.js
// Populates the database with a sample store (active subscription), its
// menu, a store-admin account, and a demo customer already registered
// within that store's service radius -- so the app is immediately usable
// after `npm run seed`.

const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const db = require('./database');

const id = () => nanoid(12);

function run() {
  const storeCount = db.prepare('SELECT COUNT(*) c FROM stores').get().c;
  if (storeCount > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  // Sample store location: downtown coordinates, subscription pre-activated
  // for one year so the seeded admin can use the app immediately.
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
    "Tony's Pizzeria",
    'owner@kahumbo.app',
    '221 Main Street',
    'Springfield',
    '62701',
    39.7817,
    -89.6501,
    7,
    499.0,
    now.toISOString(),
    oneYearFromNow.toISOString()
  );

  const categories = [
    { id: id(), name: 'Pizzas', sort_order: 1 },
    { id: id(), name: 'Sides', sort_order: 2 },
    { id: id(), name: 'Drinks', sort_order: 3 },
    { id: id(), name: 'Desserts', sort_order: 4 },
  ];
  const insertCategory = db.prepare(
    'INSERT INTO categories (id, store_id, name, sort_order) VALUES (?, ?, ?, ?)'
  );
  categories.forEach((c) => insertCategory.run(c.id, storeId, c.name, c.sort_order));

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

  function addPizza(name, description, price, veg) {
    const itemId = id();
    insertItem.run(itemId, storeId, categories[0].id, name, description, price, null, veg ? 1 : 0);

    const sizeGroup = id();
    insertGroup.run(sizeGroup, itemId, 'Size', 1, 1, 1);
    insertChoice.run(id(), sizeGroup, 'Small (8")', 0);
    insertChoice.run(id(), sizeGroup, 'Medium (11")', 3);
    insertChoice.run(id(), sizeGroup, 'Large (14")', 6);

    const crustGroup = id();
    insertGroup.run(crustGroup, itemId, 'Crust', 1, 1, 1);
    insertChoice.run(id(), crustGroup, 'Hand Tossed', 0);
    insertChoice.run(id(), crustGroup, 'Thin Crust', 0);
    insertChoice.run(id(), crustGroup, 'Cheese Burst', 2.5);

    const toppingGroup = id();
    insertGroup.run(toppingGroup, itemId, 'Extra Toppings', 0, 5, 0);
    ['Extra Cheese', 'Mushroom', 'Jalapeno', 'Onion', 'Olives'].forEach((t) =>
      insertChoice.run(id(), toppingGroup, t, 1)
    );
  }

  addPizza('Margherita', 'Classic tomato sauce and mozzarella.', 8.99, true);
  addPizza('Farmhouse', 'Onion, capsicum, tomato, mushroom.', 10.49, true);
  addPizza('Peppy Paneer', 'Spiced paneer, capsicum, red pepper.', 10.99, true);
  addPizza('Chicken Pepperoni', 'Loaded with pepperoni slices.', 11.99, false);
  addPizza('BBQ Chicken', 'Smoky BBQ sauce, grilled chicken, onions.', 12.49, false);

  const sides = [
    ['Garlic Breadsticks', 'Baked fresh with garlic butter.', 4.49],
    ['Cheesy Dip', 'Warm melted cheese dip.', 1.99],
    ['Loaded Wedges', 'Potato wedges with cheese and jalapeno.', 5.49],
  ];
  sides.forEach(([n, d, p]) => insertItem.run(id(), storeId, categories[1].id, n, d, p, null, 1));

  const drinks = [
    ['Cola (500ml)', 'Chilled soft drink.', 1.99],
    ['Lemonade', 'Fresh-squeezed lemonade.', 2.49],
    ['Iced Tea', 'House-brewed iced tea.', 2.29],
  ];
  drinks.forEach(([n, d, p]) => insertItem.run(id(), storeId, categories[2].id, n, d, p, null, 1));

  const desserts = [
    ['Choco Lava Cake', 'Warm cake with molten center.', 3.99],
    ['Butterscotch Mousse', 'Creamy chilled mousse cup.', 3.49],
  ];
  desserts.forEach(([n, d, p]) => insertItem.run(id(), storeId, categories[3].id, n, d, p, null, 1));

  // Store-admin account (formerly "admin"): owner@kahumbo.app / admin123
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, phone, password_hash, role, store_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run(
    id(),
    "Tony (Owner)",
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
  ).run(id(), customerId, '450 Oak Avenue', 'Springfield', '62701', 39.79, -89.645);

  console.log('Seed complete.');
  console.log('Store admin login -> email: owner@kahumbo.app     password: admin123');
  console.log('Demo customer      -> email: customer@kahumbo.app  password: customer123');
  console.log(`Store location: lat 39.7817, lng -89.6501 (service radius ${7}km)`);
}

run();
