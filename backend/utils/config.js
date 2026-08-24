// utils/config.js
// Single source of truth for the store delivery-radius bounds. Every route
// that enforces or references this range should import from here rather
// than hardcoding a number -- that's exactly how a mismatch slipped in
// before (auth.js had its own separate hardcoded 6 while stores.js used a
// different constant).
//
// There is no real minimum -- a store can legitimately serve just its own
// street or a tight neighbourhood, so MIN_SERVICE_RADIUS_KM is only a tiny
// sanity floor (not a business rule) to avoid a literal 0km radius, which
// would only ever match a customer standing on the exact same GPS point as
// the store. Orders are allowed up to 7km from the store -- see
// MAX_SERVICE_RADIUS_KM below.
const MIN_SERVICE_RADIUS_KM = 0.1;
const MAX_SERVICE_RADIUS_KM = 7;
const DEFAULT_SERVICE_RADIUS_KM = 7;
const DELIVERY_FEE = 100; // flat fee, in rupees, per order

module.exports = { MIN_SERVICE_RADIUS_KM, MAX_SERVICE_RADIUS_KM, DEFAULT_SERVICE_RADIUS_KM, DELIVERY_FEE };
