// utils/email.js
// Sends order-confirmation emails via SMTP (nodemailer). Configured entirely
// through environment variables so no code changes are needed to point it
// at a real mailbox -- see backend/.env.example for the required keys.
//
// If SMTP isn't configured yet, every function here just logs a warning and
// returns silently rather than throwing: a missing email setup should never
// block someone from placing or confirming an order.
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

let transporter = null;
let warned = false;

function getTransporter() {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    if (!warned) {
      console.warn('[email] SMTP_HOST/PORT/USER/PASS not set -- order confirmation emails are disabled.');
      warned = true;
    }
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465, // true for 465, false for 587/others (STARTTLS)
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

async function sendOrderConfirmationEmail(toEmail, order, storeName) {
  const client = getTransporter();
  if (!client || !toEmail) return;

  const itemLines = (order.items || [])
    .map((it) => `  ${it.quantity} x ${it.name} - \u20b9${Math.round(it.unit_price * it.quantity)}`)
    .join('\n');

  const text = `Thanks for your order from ${storeName || 'Kahumbo'}!

Order #${order.id.slice(0, 6).toUpperCase()}

${itemLines}

Delivery fee: \u20b9${Math.round(order.delivery_fee)}
Tax: \u20b9${Math.round(order.tax)}
Total: \u20b9${Math.round(order.total)}

Delivering to: ${order.address_line || 'address on file'}
Payment: ${order.payment_method === 'online' ? 'Paid online' : 'Cash on delivery'}

We'll notify you as your order moves through preparation and delivery.`;

  try {
    await client.sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject: `Order confirmed - #${order.id.slice(0, 6).toUpperCase()}`,
      text,
    });
  } catch (err) {
    // Never let a failed email break order placement -- just log it.
    console.error('[email] Failed to send order confirmation:', err.message);
  }
}

module.exports = { sendOrderConfirmationEmail };
