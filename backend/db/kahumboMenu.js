// db/kahumboMenu.js
// The one standard Kahumbo menu -- every store is the same brand serving
// the same products, so every store gets an identical copy of this menu
// (its own categories/items/prices, fully independent rows, just created
// from the same template). This runs both when seeding the demo store and
// automatically right after a real store registers (see routes/stores.js)
// -- a new store should never start with an empty menu.
const { nanoid } = require('nanoid');
const db = require('./database');
const itemImages = require('./itemImages');

const id = () => nanoid(12);

const ITEM_IMAGE_BY_NAME = {
  'Jamun Shot': itemImages.jamun_shot,
  'Pop Shots Combo (Any 6 Flavours, on stick)': itemImages.pop_shots,
  'Guava Fruit': itemImages.guava_frost,
  'Pineapple Fruit': itemImages.pineapple_frost,
  'Orange Fruit': itemImages.orange_frost,
  'Mango Shot': itemImages.mango_promo,
  'Caramel Latte Iced Coffee': itemImages.ice_latte,
};

const CATEGORY_NAMES = [
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

// Builds the full menu as a plain JS data structure first (no database
// calls here at all) -- this is exactly the same item/price/size data as
// before, just assembled in memory rather than written to the database one
// call at a time. All the actual database writes happen afterward, in
// buildMenuWriteOperations()/createStandardMenu() below, in a single batch.
function buildMenuPlan() {
  const categories = CATEGORY_NAMES.map((name, i) => ({ name, sortOrder: i + 1 }));
  const items = []; // { categoryName, name, price, description, sizes? }

  function addItem(categoryName, name, price, description = '') {
    items.push({ categoryName, name, price, description });
  }
  function addSizedItem(categoryName, name, sizes, description = '') {
    items.push({ categoryName, name, price: sizes[0][1], description, sizes });
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

  return { categories, items };
}

// Writes the full plan for one store using the given async db handle
// (either the top-level db module, or a transaction handle passed in from
// a caller that wants this bundled into its own larger transaction, e.g.
// routes/stores.js during registration).
async function writeMenuPlan(handle, storeId) {
  const { categories, items } = buildMenuPlan();

  const categoryIds = {};
  for (const cat of categories) {
    const catId = id();
    categoryIds[cat.name] = catId;
    await handle.run('INSERT INTO categories (id, store_id, name, sort_order) VALUES (?, ?, ?, ?)', [catId, storeId, cat.name, cat.sortOrder]);
  }

  for (const item of items) {
    const itemId = id();
    await handle.run(
      `INSERT INTO menu_items (id, store_id, category_id, name, description, base_price, image_url, is_available, is_veg)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [itemId, storeId, categoryIds[item.categoryName], item.name, item.description, item.price, ITEM_IMAGE_BY_NAME[item.name] || null]
    );

    if (item.sizes && item.sizes.length > 1) {
      const groupId = id();
      await handle.run(
        'INSERT INTO option_groups (id, menu_item_id, name, min_select, max_select, required) VALUES (?, ?, ?, ?, ?, ?)',
        [groupId, itemId, 'Size', 1, 1, 1]
      );
      for (const [label, price] of item.sizes) {
        await handle.run('INSERT INTO option_choices (id, group_id, name, price_delta) VALUES (?, ?, ?, ?)', [id(), groupId, label, price - item.price]);
      }
    }
  }
}

// Creates a fresh copy of the standard Kahumbo menu for the given storeId.
// If a transaction handle (tx) is passed in -- e.g. from routes/stores.js,
// which wraps store + user + menu creation in one atomic registration --
// this reuses that transaction instead of opening its own. Otherwise (e.g.
// db/seed.js calling this standalone) it opens and commits its own
// transaction.
async function createStandardMenu(storeId, tx) {
  if (tx) {
    await writeMenuPlan(tx, storeId);
  } else {
    await db.transaction((innerTx) => writeMenuPlan(innerTx, storeId));
  }
}

module.exports = { createStandardMenu };
