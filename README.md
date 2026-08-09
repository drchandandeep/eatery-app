# Kahumbo

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
  activates an **annual** subscription (`POST /api/stores/subscribe`).
  Customer signup and ordering are always free.
- **Email + store address are permanent.** Once a store registers, its
  owner email and physical address can never be changed by any API
  endpoint (`PATCH /api/stores/me` explicitly rejects those fields). This
  stops one paid account being re-pointed at a different physical location
  to avoid paying for a second store -- a new location needs a new email
  and its own subscription.
- **Customers are geofenced to one store.** Signup requires picking a
  specific store and submitting an address with coordinates
  (`lat`/`lng`, e.g. from the device's GPS). The backend rejects the
  signup if that address is more than the store's service radius
  (5-6km, capped at 6km) from the store. The customer's store link and
  registration address are then locked for that account, same as above.
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
| Annual store subscription (mock billing) | `AdminDashboardScreen` + `POST /api/stores/subscribe` |
| Nearby-store lookup (5-6km geofence) | `SignupScreen` + `GET /api/stores/nearby` |
| Customer signup locked to one store | `SignupScreen` + `POST /api/auth/signup` |
| Menu browsing by category, scoped per store | `MenuScreen` + `GET /api/menu?store_id=` |
| Item customization (size, crust, toppings, etc.) | `ItemDetailScreen` + `option_groups`/`option_choices` tables |
| Cart | `CartContext` (client-side, submitted at checkout) |
| Checkout & payment method selection | `CheckoutScreen` + `POST /api/orders` |
| Live order tracking | `OrderTrackingScreen` (polls every 5s) + status timeline |
| User accounts, signup/login | `AuthContext` + JWT auth on the backend |
| Order history | `OrderHistoryScreen` + `GET /api/orders` |
| Admin dashboard (stats, top items, subscription status) | `AdminDashboardScreen` + `GET /api/admin/stats` |
| Admin order management (advance status) | `AdminOrdersScreen` + `PATCH /api/admin/orders/:id/status` |
| Admin menu management (add/edit/delete items & categories, toggle availability) | `AdminMenuScreen` + `GET/POST/PATCH/DELETE /api/admin/menu` and `/api/admin/categories` |

## Notes & next steps

- **Store subscription billing** is currently a mock (`POST /api/stores/subscribe`
  just flips the store to active and sets a 1-year expiry) — no real payment
  processor is wired in. For production, integrate Stripe Billing (or a
  local equivalent) server-side before activating a subscription for real.
- **Payments** for customer orders are currently just a method *selection*
  (card/cash/wallet) — no real payment processor is wired in either.
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
