// utils/otp.js
// Shared logic for generating and verifying the 6-digit email OTPs used by
// both the "forgot password" flow (not logged in) and the "change
// password" flow (logged in, extra verification step). Kept in one place
// so both routes/auth.js endpoints that touch OTPs agree on expiry length,
// code format, and single-use enforcement.
const { nanoid } = require('nanoid');
const db = require('../db/database');

const OTP_TTL_MINUTES = 10;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, never starts with 0
}

// Creates a fresh OTP for a user + purpose, invalidating any earlier
// unused codes for that same user+purpose so only the most recent one
// entered by the user will actually work.
async function createOtp(userId, purpose) {
  await db.run('UPDATE password_otps SET used = 1 WHERE user_id = ? AND purpose = ? AND used = 0', [userId, purpose]);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  await db.run(
    'INSERT INTO password_otps (id, user_id, code, purpose, expires_at) VALUES (?, ?, ?, ?, ?)',
    [nanoid(12), userId, code, purpose, expiresAt]
  );
  return code;
}

// Returns true and marks the code used if it's valid; false otherwise.
// A code is valid only if: it matches, it's for the right user+purpose,
// it hasn't expired, and it hasn't already been used.
async function verifyAndConsumeOtp(userId, purpose, code) {
  const row = await db.get(
    `SELECT * FROM password_otps
     WHERE user_id = ? AND purpose = ? AND code = ? AND used = 0
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose, String(code || '').trim()]
  );

  if (!row) return false;
  if (new Date(row.expires_at) < new Date()) return false;

  await db.run('UPDATE password_otps SET used = 1 WHERE id = ?', [row.id]);
  return true;
}

module.exports = { createOtp, verifyAndConsumeOtp, OTP_TTL_MINUTES };
