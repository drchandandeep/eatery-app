// api/client.js
// Thin fetch wrapper. Change BASE_URL to point at your deployed backend.
// While developing locally with Expo Go on a physical device, use your
// computer's LAN IP instead of localhost (e.g. http://192.168.1.20:4000).

export const BASE_URL = 'https://kahumbo.onrender.com/api';

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const useToken = token || authToken;
  if (useToken) headers.Authorization = `Bearer ${useToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // auth (customers)
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
  login: (identifier, password) => request('/auth/login', { method: 'POST', body: { identifier, password } }),
  me: (token) => request('/auth/me', { token }),
  updateMyCredentials: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),

  // forgot password (not logged in)
  requestPasswordReset: (identifier) => request('/auth/forgot-password/request', { method: 'POST', body: { identifier } }),
  resetPassword: (payload) => request('/auth/forgot-password/reset', { method: 'POST', body: payload }),

  // change password while logged in (any role, requires an emailed OTP)
  requestPasswordChangeOtp: () => request('/auth/password/request-otp', { method: 'POST' }),
  changePassword: (payload) => request('/auth/password/change', { method: 'POST', body: payload }),

  // stores
  nearbyStores: (lat, lng, radiusKm = 7) =>
    request(`/stores/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`),
  registerStore: (payload) => request('/stores/register', { method: 'POST', body: payload }),
  myStore: () => request('/stores/me'),
  updateStore: (payload) => request('/stores/me', { method: 'PATCH', body: payload }),

  // subscription (own-QR + manual approval, not a payment gateway)
  getSubscriptionQr: () => request('/stores/subscription-qr'),
  submitSubscriptionProof: (payload) => request('/stores/subscription/submit-proof', { method: 'POST', body: payload }),
  mySubscriptionRequests: () => request('/stores/subscription/requests'),

  // menu
  getMenu: (storeId) => request(storeId ? `/menu?store_id=${storeId}` : '/menu'),
  getItem: (id) => request(`/menu/items/${id}`),

  // orders -- payment_method is 'cash' (Cash on Delivery, Cash/UPI at the
  // door) or 'qr' (customer pays via the store's own uploaded QR code and
  // confirms in-app). Neither is gateway-verified; see routes/orders.js.
  placeOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
  getOrders: () => request('/orders'),
  getOrder: (id) => request(`/orders/${id}`),

  // admin (store_admin)
  adminStats: () => request('/admin/stats'),
  adminOrders: (status) => request(`/admin/orders${status ? `?status=${status}` : ''}`),
  adminUpdateOrderStatus: (id, status, etaMinutes) =>
    request(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status, eta_minutes: etaMinutes } }),

  // admin menu management (store_admin)
  adminGetMenu: () => request('/admin/menu'),
  adminCreateItem: (payload) => request('/admin/menu/items', { method: 'POST', body: payload }),
  adminUpdateItem: (id, payload) => request(`/admin/menu/items/${id}`, { method: 'PATCH', body: payload }),
  adminDeleteItem: (id) => request(`/admin/menu/items/${id}`, { method: 'DELETE' }),
  adminCreateCategory: (payload) => request('/admin/categories', { method: 'POST', body: payload }),
  adminUpdateCategory: (id, payload) => request(`/admin/categories/${id}`, { method: 'PATCH', body: payload }),
  adminDeleteCategory: (id) => request(`/admin/categories/${id}`, { method: 'DELETE' }),

  // platform admin (reviewing subscription payment proofs, platform QR)
  platformSubscriptionRequests: (status = 'pending') => request(`/platform/subscription-requests?status=${status}`),
  platformApproveRequest: (id) => request(`/platform/subscription-requests/${id}/approve`, { method: 'POST' }),
  platformRejectRequest: (id, reason) => request(`/platform/subscription-requests/${id}/reject`, { method: 'POST', body: { reason } }),
  platformGetQrCode: () => request('/platform/qr-code'),
  platformSetQrCode: (payload) => request('/platform/qr-code', { method: 'POST', body: payload }),
  platformReports: () => request('/platform/reports'),
  platformStoreReport: (storeId) => request(`/platform/reports/${storeId}`),
};
