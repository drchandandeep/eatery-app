// utils/config.js
// Single source of truth for the store delivery-radius bounds. Every route
// that enforces or references this range should import from here rather
// than hardcoding a number -- that's exactly how a mismatch slipped in
// before (auth.js had its own separate hardcoded 6 while stores.js used a
// different constant).
const MIN_SERVICE_RADIUS_KM = 5;
const MAX_SERVICE_RADIUS_KM = 10;
const DEFAULT_SERVICE_RADIUS_KM = 7;
const DELIVERY_FEE = 100; // flat fee, in rupees, per order

module.exports = { MIN_SERVICE_RADIUS_KM, MAX_SERVICE_RADIUS_KM, DEFAULT_SERVICE_RADIUS_KM, DELIVERY_FEE };
