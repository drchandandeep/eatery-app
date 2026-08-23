// utils/storeStatus.js
// Single source of truth for "can this store currently accept new orders?"
// Three independent things can block ordering, and every one of them must
// be checked the same way everywhere -- orders.js and menu.js both import
// this rather than each rolling their own check, which is exactly how the
// service-radius and delivery-fee bugs slipped in earlier in this project
// (the same number/logic defined in two places, and the two copies quietly
// drifting apart).
const { effectiveStoreStatus } = require('./subscription');

// This app is India-only, so store hours are stored as plain 'HH:MM' in IST
// with no timezone field. IST is UTC+5:30 -- computed from the server's UTC
// clock rather than trusting the server's local timezone, since Render (and
// most hosts) run in UTC regardless of where the store physically is.
function currentIstTime() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isWithinHours(opensAt, closesAt) {
  const now = currentIstTime();
  // Plain string comparison works because 'HH:MM' is zero-padded and
  // opens_at < closes_at is always true for this app's same-day windows
  // (e.g. '12:00' to '20:00') -- no overnight-spanning hours to handle.
  return now >= opensAt && now < closesAt;
}

// Returns { open: boolean, reason: string|null }
// reason is one of: 'subscription_inactive' | 'paused_by_store' | 'outside_hours' | null (open)
function getStoreOrderingStatus(store) {
  if (effectiveStoreStatus(store) !== 'active') {
    return { open: false, reason: 'subscription_inactive' };
  }
  if (!store.accepting_orders) {
    return { open: false, reason: 'paused_by_store' };
  }
  if (!isWithinHours(store.opens_at, store.closes_at)) {
    return { open: false, reason: 'outside_hours' };
  }
  return { open: true, reason: null };
}

module.exports = { getStoreOrderingStatus, isWithinHours, currentIstTime };
