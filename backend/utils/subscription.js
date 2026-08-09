// utils/subscription.js
// A store's raw subscription_status column can go stale (it only flips to
// 'expired' when something happens to notice the expiry date has passed).
// This computes the true, current status on every check instead of trusting
// the stored value blindly.
function effectiveStoreStatus(store) {
  if (store.subscription_status === 'active') {
    const expired = !store.subscription_expires_at || new Date(store.subscription_expires_at) < new Date();
    return expired ? 'expired' : 'active';
  }
  return store.subscription_status;
}

module.exports = { effectiveStoreStatus };
