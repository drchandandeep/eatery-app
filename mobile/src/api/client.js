// api/client.js
// Thin fetch wrapper. Change BASE_URL to point at your deployed backend.
// While developing locally with Expo Go on a physical device, use your
// computer's LAN IP instead of localhost (e.g. http://192.168.1.20:4000).

export const BASE_URL = 'http://localhost:4000/api';

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
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: (token) => request('/auth/me', { token }),

  // stores
  nearbyStores: (lat, lng, radiusKm = 6) =>
    request(`/stores/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`),
  registerStore: (payload) => request('/stores/register', { method: 'POST', body: payload }),
  myStore: () => request('/stores/me'),
  subscribeStore: () => request('/stores/subscribe', { method: 'POST' }),

  // menu
  getMenu: (storeId) => request(storeId ? `/menu?store_id=${storeId}` : '/menu'),
  getItem: (id) => request(`/menu/items/${id}`),

  // orders
  placeOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
  getOrders: () => request('/orders'),
  getOrder: (id) => request(`/orders/${id}`),

  // admin (store_admin)
  adminStats: () => request('/admin/stats'),
  adminOrders: (status) => request(`/admin/orders${status ? `?status=${status}` : ''}`),
  adminUpdateOrderStatus: (id, status) =>
    request(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status } }),
};
