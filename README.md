# Kahumbo

> **Orders are allowed up to 7km from the store.** There's no minimum --
> a store can serve just its own street or neighbourhood, right up to a
> 7km cap. See `backend/utils/config.js` for the single source of truth on
> this range.

A full-stack, **multi-store** food-ordering platform: stores register and
pay an annual subscription, customers sign up for free (tied to one nearby
store), menu browsing with item customization, cart & checkout, live order
tracking, order history, and a per-store admin dashboard. Built as an
original app -- not a copy of any existing app or its assets.

```
eatery-app/
├── backend/    Node.js + Express + SQLite REST API
└── mobile/     React Native (Expo) app for iOS + Android
```

## How the multi-store model works

- **Stores pay, customers don't.** A store owner registers via
  `POST /api/stores/register` with an email + the store's address, then
  activates an **annual** subscription by paying via the platform's own QR
  code and uploading proof (`POST /api/stores/subscription/submit-proof`).
  Customer signup and ordering are always free.
- **Email + store address are permanent.** Once a store registers, its
  owner email and physical address can never be changed by any API
  endpoint (`PATCH /api/stores/me` explicitly rejects those fields). This
  stops one paid account being re-pointed at a different physical location
  to avoid paying for a second store -- a new location needs a new email
  and its own subscription.
- **Customers are geofenced to one store, up to 7km, no minimum.**
  Signup requires picking a specific store and submitting an address with
  coordinates (`lat`/`lng`, e.g. from the device's GPS). The backend
  rejects the signup if that address is further than the store's service
  radius (any value up to 7km -- a store can legitimately set this
  smaller, e.g. to serve just its own neighbourhood) from the store. The
  customer's store link and registration address are then locked for that
  account, same as above.
- **Subscription gates store features, not customer ordering.** If a
  store's annual subscription lapses, `/api/admin/*` (menu management,
  order handling, stats) responds `402` until it's renewed. Customers on
  an expired store simply won't see it in `stores/nearby` results.

## 1. Run the backend

```bash
cd backend
npm install
cp .env.example .env       # edit JWT_SECRET for anything beyond local testing
npm run seed                # creates the SQLite DB + sample menu + admin user
npm start                   # runs on http://localhost:4000
```

Seeded logins:
- **Store admin:** owner@kahumbo.app / admin123 (subscription pre-activated for 1 year)
- **Demo customer:** customer@kahumbo.app / customer123 (registered ~1km from the seeded store)

Quick check it's alive: `curl http://localhost:4000/api/health`

## 2. Run the mobile app

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android) to run it on your phone, or
press `a` / `i` in the terminal for an emulator.

### Point the app at your backend

Edit `mobile/src/api/client.js`:

```js
export const BASE_URL = 'http://localhost:4000/api';
```

- **Simulator/emulator on the same computer as the backend:** `localhost` works.
- **Physical phone via Expo Go:** replace `localhost` with your computer's LAN
  IP, e.g. `http://192.168.1.20:4000/api` (phone and computer must be on the
  same Wi-Fi).
- **Deployed backend:** point it at your production URL, e.g.
  `https://api.yourdomain.com/api`.

## 3. Building real app-store binaries

This is a genuine cross-platform React Native project, so when you're ready
for real `.apk` / `.ipa` files:

```bash
npm install -g eas-cli
eas login
eas build --platform android
eas build --platform ios
```

No code changes needed — Expo/EAS handles the native compilation in the
cloud and gives you a download link for the installable binary.

## 4. Developing via GitHub (Codespaces)

You can push this project to GitHub and develop entirely in the cloud with
**GitHub Codespaces** — no local Node install required. A `.devcontainer/`
config is already included; it auto-installs both apps' dependencies and
forwards the ports you need.

**Push the code:**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```
(Create the empty repo first at github.com/new — don't initialize it with a
README there, or the push will conflict.)

**Open a Codespace:** on your repo's GitHub page, click **Code → Codespaces
→ Create codespace on main**. Wait for it to finish building — dependencies
install automatically via `postCreateCommand`.

**Run the backend** in the Codespace terminal:
```bash
cd backend
npm run seed
npm start
```
A "Ports" tab notification will pop up for port 4000 — click it, or open the
**Ports** panel at the bottom of the editor and set port `4000`'s visibility
to **Public** (it should already default to public from the devcontainer
config, but double-check). Copy that forwarded URL — it looks like
`https://<codespace-name>-4000.app.github.dev`.

**Point the mobile app at that URL:** open `mobile/src/api/client.js` and
set:
```js
export const BASE_URL = 'https://<codespace-name>-4000.app.github.dev/api';
```
This step matters more here than on your own machine — `localhost` inside
the Codespace's container is not reachable from your phone, so the mobile
app needs the public forwarded URL instead.

**Run the mobile app** in a second Codespace terminal:
```bash
cd mobile
npx expo start --tunnel
```
`--tunnel` is important here too — it gives Expo Go a public URL to connect
through, since your phone and the Codespace aren't on the same network.
Scan the QR code that appears with the Expo Go app.

**Iterating:** edit files right in the Codespace's browser editor (or
connect VS Code desktop to it); both `npm start` and `expo start` hot-reload
on save, same as running locally.

**A simpler alternative** if you don't need to *run* the app in the cloud,
just store/collaborate on the code: push to GitHub as above, then deploy
`backend/` to a host like Render or Railway (both offer "connect a GitHub
repo, auto-deploy on push"), and keep running `mobile/` locally on your own
machine pointed at that deployed backend URL.

## What's included

| Feature | Where |
|---|---|
| Store registration (locked email + address) | `StoreRegisterScreen` + `POST /api/stores/register` |
| Annual store subscription (own-QR + manual approval) | `SubscriptionPaymentScreen` + `POST /api/stores/subscription/submit-proof`, approved via `PlatformAdminScreen` or the `/admin` web page |
| Nearby-store lookup (up to 7km, no minimum) | `SignupScreen` + `GET /api/stores/nearby` |
| Customer signup locked to one store, email or phone login | `SignupScreen`, `LoginScreen` + `POST /api/auth/signup`, `POST /api/auth/login` |
| Menu browsing by category, scoped per store | `MenuScreen` + `GET /api/menu?store_id=` |
| Item customization (size, crust, toppings, etc.) | `ItemDetailScreen` + `option_groups`/`option_choices` tables |
| Cart | `CartContext` (client-side, submitted at checkout) |
| Checkout & payment (store's own QR "Pay online", or Cash on Delivery) | `CheckoutScreen` + `POST /api/orders` |
| Order confirmation email | `utils/email.js` (SMTP, optional -- silently skipped if unset) |
| Live order tracking with ETA | `OrderTrackingScreen` (polls every 5s) + status timeline + `estimated_delivery_minutes` |
| User accounts, signup/login | `AuthContext` + JWT auth on the backend |
| Order history | `OrderHistoryScreen` + `GET /api/orders` |
| Admin dashboard (stats, top items, subscription status) | `AdminDashboardScreen` + `GET /api/admin/stats` |
| Admin order management (advance status, set ETA) | `AdminOrdersScreen` + `PATCH /api/admin/orders/:id/status` |
| Admin menu management (add/edit/delete items & categories, toggle availability) | `AdminMenuScreen` + `GET/POST/PATCH/DELETE /api/admin/menu` and `/api/admin/categories` |
| Platform admin: review subscription payments, set platform QR | `PlatformAdminScreen` (mobile) or `/admin` (password-protected web page) + `routes/platform.js` |
| Operating hours (default 12:00-20:00 IST) + manual order pause | `StoreAvailabilityCard` in `AdminDashboardScreen` + `PATCH /api/stores/me` + `utils/storeStatus.js` |

## Notes & next steps

- **Persistent storage is required in production, not optional.** Without a
  persistent disk, `DB_PATH` defaults to a file inside the container's own
  filesystem, which Render wipes on every restart or redeploy (Render
  restarts services on its own sometimes, not only when you push code) --
  this silently deletes every real store, customer, order, and uploaded QR
  code, keeping only what `db/seed.js` recreates. Fix: Render dashboard ->
  your service -> **Disks** tab -> **Add Disk**, choose a mount path (e.g.
  `/var/data`), then set the `DB_PATH` environment variable to a file
  inside that mount (e.g. `/var/data/kahumbo.db`) in the **Environment**
  tab. See `.env.example` for the exact variable. This has a small monthly
  cost on top of the Starter compute plan.

- **Every store shares the same standard Kahumbo menu.** `db/kahumboMenu.js`
  holds the one true menu template (categories, items, prices, photos); it's
  used both to seed the demo store and automatically for every real store at
  `POST /api/stores/register`. A new store never starts with a blank menu --
  the owner can still edit/add/remove items afterward from Admin > Manage
  Menu if a location genuinely needs to differ.
- **Reporting**: `GET /api/platform/reports` (platform-wide totals: stores,
  orders, revenue) and `GET /api/platform/reports/:storeId` (one store's own
  numbers) are platform_admin-only. Available on both the `/admin` web page
  (dropdown) and the mobile Platform Admin screen (tap-to-select chips).
  Revenue excludes cancelled orders.
- **Forgot password**: `POST /api/auth/forgot-password/request` emails a
  6-digit code (10 min expiry) to the account's registered address;
  `POST /api/auth/forgot-password/reset` consumes it. Works for any role.
- **Change password (logged in)**: `POST /api/auth/password/request-otp`
  then `POST /api/auth/password/change` (needs current password + the
  emailed code together). Works for every role, including store owners --
  this is deliberately separate from `PATCH /api/auth/me` above, which only
  handles the platform_admin/customer email-change case and still blocks
  store_admin from touching their email.
- **Transactional emails** now cover the full lifecycle, all through
  `utils/email.js` and all silently skipped (never blocking) if SMTP isn't
  configured: customer welcome on signup, subscription proof submitted,
  subscription approved/rejected, new order (to the store owner) alongside
  the existing order-confirmed (to the customer), and order confirmed/
  delivered (to *both* customer and store owner).

- **Annual subscription fee**: starts at Rs 60,000 and compounds 10% on every
  approved renewal (Year 1 Rs 60,000 -> Year 2 Rs 66,000 -> Year 3
  Rs 72,600...), set in `routes/platform.js`'s approve handler. This is
  informational only (shown to the store owner on their next payment
  screen) since payment itself is manual/QR-based, not gateway-enforced.
- **Changing your platform admin login**: the seeded `platform@kahumbo.app`
  account is just a starting point. Log in at `/admin`, scroll to "Your
  login", and set your real email/password any time -- `PATCH /api/auth/me`.
  Store owner accounts (`store_admin`) deliberately cannot change their own
  login email this way, since it's what keeps "one owner, one store" true
  (see `routes/stores.js`); customers and platform admins have no such
  restriction.

- **Store availability** is checked in one shared place
  (`utils/storeStatus.js`) by `routes/orders.js`, `routes/payments.js`, and
  `routes/menu.js` alike, so all three can never disagree about whether a
  store is currently open. Three independent things can close a store:
  subscription lapsed, the owner manually paused orders (e.g. mid-rush), or
  it's outside the store's set operating hours -- each has its own
  human-readable message. Hours are stored as plain `'HH:MM'` with no
  timezone field, computed against IST specifically (`UTC+5:30`), since this
  app is India-only -- if you ever need multi-timezone support, that
  assumption lives in one function (`currentIstTime()`) and would need
  revisiting there.

- **Customer order payments** are deliberately gateway-free, by design: each
  store owner uploads their own UPI QR code (at registration, or later from
  their Admin dashboard's "Order payment QR" card -- `PATCH /api/stores/me`
  with `order_qr_image_base64`/`order_upi_id`). At checkout, a customer
  picks either **Cash on Delivery** (settled in person) or **Pay online**
  (shows the store's QR, they scan it in their own UPI app, then tap
  "I've paid" to place the order). Neither path is automatically verified
  -- there is no payment gateway integration in this app -- so the store
  owner is the one who confirms money actually landed, typically by
  checking their own UPI app before advancing an order past "confirmed".
  If a store hasn't uploaded a QR yet, "Pay online" is disabled and greyed
  out at checkout, and only Cash on Delivery is offered.
- **Store subscription billing** works the same way, one level up: the
  platform owner (you) uploads your own QR code (via the `/admin` web page
  or the mobile app's Platform Admin screen -- `GET`/`POST /api/platform/qr-code`),
  a store owner scans it to pay their annual fee, then uploads a screenshot
  as proof (`POST /api/stores/subscription/submit-proof`). A `platform_admin`
  account (seeded as `gkgst2026@gmail.com` -- change this password once
  you're using it for real) reviews it and approves/rejects from either the
  mobile app's Approvals screen or the `/admin` web page. Nothing
  auto-activates on upload -- a screenshot alone can't be verified as a
  real, successful payment, so a human always makes the final call. The fee
  itself compounds 10% on every approved renewal (see `routes/platform.js`).
  The QR upload flow on both `/admin` and the mobile Platform Admin screen
  is flexible: if no QR is set yet, it prompts you to upload one; if one
  already exists, it's shown first with a "change" option below it, so you
  can update it any time (e.g. if you switch UPI accounts). A placeholder
  image is seeded until you upload your real one. This intentionally trades
  instant activation for zero payment gateway fees and full manual control
  over both the once-a-year subscription flow and everyday order payments.
- **Order confirmation emails** are optional and off by default. Set
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in
  `backend/.env` to turn them on (see `.env.example` for a Gmail example
  using an App Password). If left unset, order placement still works
  normally -- the email step is just silently skipped with a one-time
  console warning.
- **Location permission**: the signup and store-registration screens need
  device location access (`expo-location`) to capture coordinates for the
  service-radius check. Run `npm install` in `mobile/` after pulling these
  changes to pick up the new dependency.
- **Geocoding**: addresses are captured as free text + raw GPS coordinates
  (no forward-geocoding API is wired in). If you want customers to type an
  address and have it auto-resolve to lat/lng, add a geocoding provider
  (Google, Mapbox, etc.) in `stores.js`/`auth.js` server-side.
- **Push notifications** for order-status changes aren't included; the
  tracking screen polls instead. Swap in Expo Notifications + a webhook
  from the admin status-update endpoint when you're ready.
- **Images**: menu items currently show a placeholder initial. Add an
  `image_url` per item (e.g. hosted on S3/Cloudinary) to show real photos.
- **Production DB**: SQLite is great for getting started; for real traffic
  consider migrating to Postgres (the query layer is isolated in
  `backend/db` and `backend/routes`, so this is a contained change).
