// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const db = require('./db/database');

const authRoutes = require('./routes/auth');
const storeRoutes = require('./routes/stores');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const platformRoutes = require('./routes/platform');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
// Raised from the default 100kb -- payment-screenshot uploads are sent as
// base64 JSON strings (routes/stores.js, routes/platform.js), which run a
// few MB for a typical phone screenshot.
app.use(express.json({ limit: '8mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true, database: db.usingTurso ? 'turso' : 'local-file' }));

app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/platform', platformRoutes);

// Password-protected web page (login form + subscription-approval UI) for
// the platform owner -- doesn't need the mobile app at all. The page itself
// is a static file; every action it takes still goes through the same
// authenticated /api/platform/* routes above, so the real security boundary
// is the platform_admin login, not obscurity of the URL.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Fallback error handler. Every route handler below is async and any
// rejected promise (e.g. a failed database call) is forwarded here via
// next(err) -- see utils/asyncHandler.js.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

// Wait for the database schema to be ready (tables created/migrated)
// before accepting any traffic -- this matters more now than it did with
// better-sqlite3, since the schema setup is now an async network call to
// Turso rather than an instant local file operation.
db.ready
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Kahumbo backend running on http://localhost:${PORT}`);
      console.log(`Database: ${db.usingTurso ? 'Turso (persistent)' : 'local file (db/kahumbo.db)'}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize the database. Server not started.', err);
    process.exit(1);
  });
