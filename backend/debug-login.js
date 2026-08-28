// debug-login.js
// One-off diagnostic: looks up a user directly and shows exactly what's
// stored, then tests the password against it in isolation -- so we can
// see whether the row is missing, the email doesn't match, or the
// password hash comparison itself is failing.
//
// Usage:
//   node debug-login.js owner@kahumbo.app admin123

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db/database');

async function main() {
  await db.ready;

  const email = (process.argv[2] || 'owner@kahumbo.app').trim().toLowerCase();
  const password = process.argv[3] || 'admin123';

  console.log('Looking up:', JSON.stringify(email));

  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

  if (!user) {
    console.log('\nNO ROW FOUND for that email.\n');
    const all = await db.all('SELECT email, role FROM users', []);
    console.log('Every email currently in the users table:');
    all.forEach((u) => console.log('  -', JSON.stringify(u.email), '(' + u.role + ')'));
    process.exit(0);
  }

  console.log('\nRow found:');
  console.log('  id:       ', user.id);
  console.log('  email:    ', JSON.stringify(user.email));
  console.log('  role:     ', user.role);
  console.log('  hash:     ', JSON.stringify(user.password_hash));
  console.log('  hash type:', typeof user.password_hash);
  console.log('  hash len: ', user.password_hash ? String(user.password_hash).length : null);

  const match = bcrypt.compareSync(password, String(user.password_hash || ''));
  console.log('\nbcrypt.compareSync(', JSON.stringify(password), ', hash ) =>', match);

  process.exit(0);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
