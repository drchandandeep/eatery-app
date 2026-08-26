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
Payment: ${order.payment_method === 'qr' ? 'Pay online (QR)' : 'Cash on delivery'}

We'll notify you as your order moves through preparation and delivery.`;

  await send(toEmail, `Order confirmed - #${order.id.slice(0, 6).toUpperCase()}`, text);
}

// Sent to the STORE OWNER whenever a new order comes in -- separate from
// the customer's own confirmation above, since they're different audiences
// with different reasons to care (the customer wants a receipt, the store
// wants to know to start preparing it).
async function sendNewOrderNotification(toEmail, order, storeName) {
  const client = getTransporter();
  if (!client || !toEmail) return;

  const itemLines = (order.items || [])
    .map((it) => `  ${it.quantity} x ${it.name}`)
    .join('\n');

  const text = `New order received at ${storeName || 'your store'}!

Order #${order.id.slice(0, 6).toUpperCase()}
Total: \u20b9${Math.round(order.total)}
Payment: ${order.payment_method === 'qr' ? 'Pay online (QR)' : 'Cash on delivery'}

${itemLines}

Deliver to: ${order.address_line || 'address on file'}

Open the app to confirm and start preparing this order.`;

  await send(toEmail, `New order - #${order.id.slice(0, 6).toUpperCase()}`, text);
}

// Sent to BOTH the customer and the store owner when an order's status
// changes to 'confirmed' or 'delivered' -- the two milestones explicitly
// worth an email on both sides, rather than every single status change.
async function sendOrderStatusEmail(toEmail, order, storeName, statusLabel) {
  const client = getTransporter();
  if (!client || !toEmail) return;

  const text = `Order #${order.id.slice(0, 6).toUpperCase()} at ${storeName || 'Kahumbo'} is now: ${statusLabel}.

Total: \u20b9${Math.round(order.total)}
Deliver to: ${order.address_line || 'address on file'}`;

  await send(toEmail, `Order ${statusLabel} - #${order.id.slice(0, 6).toUpperCase()}`, text);
}

// Sent to a store owner when they submit subscription payment proof, and
// again when a platform_admin approves or rejects it.
async function sendSubscriptionSubmittedEmail(toEmail, storeName) {
  await send(
    toEmail,
    'Subscription payment received - pending review',
    `Thanks -- we've received your subscription payment proof for ${storeName}. We'll review it shortly and email you once it's approved.`
  );
}

async function sendSubscriptionApprovedEmail(toEmail, storeName, expiresAt) {
  await send(
    toEmail,
    `Subscription active - ${storeName}`,
    `Good news! ${storeName}'s annual subscription is now active, valid until ${new Date(expiresAt).toDateString()}. Customers can now order from your store.`
  );
}

async function sendSubscriptionRejectedEmail(toEmail, storeName) {
  await send(
    toEmail,
    `Subscription payment could not be verified - ${storeName}`,
    `We couldn't verify the subscription payment proof submitted for ${storeName}. Please double check your payment and submit a new screenshot from the app.`
  );
}

// Sent to a customer right after they sign up, for parity with the store
// owner's "submission received" email above.
async function sendCustomerWelcomeEmail(toEmail, name, storeName) {
  await send(
    toEmail,
    'Welcome to Kahumbo!',
    `Hi ${name || 'there'}, you're all set up to order from ${storeName || 'your local Kahumbo store'}. Open the app to browse the menu and place your first order.`
  );
}

// One-time codes for forgot-password and change-password-while-logged-in.
async function sendOtpEmail(toEmail, code, purpose) {
  const purposeText = purpose === 'forgot' ? 'reset your password' : 'change your password';
  await send(
    toEmail,
    'Your Kahumbo verification code',
    `Your one-time code to ${purposeText} is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`
  );
}

// Shared low-level sender -- every function above funnels through this so
// there's exactly one place that builds the transporter, sets the "from"
// address, and swallows/logs failures without ever throwing back into the
// caller's request handler.
async function send(toEmail, subject, text) {
  const client = getTransporter();
  if (!client || !toEmail) return;
  try {
    await client.sendMail({ from: SMTP_FROM, to: toEmail, subject, text });
  } catch (err) {
    console.error('[email] Failed to send:', subject, '-', err.message);
  }
}

module.exports = {
  sendOrderConfirmationEmail,
  sendNewOrderNotification,
  sendOrderStatusEmail,
  sendSubscriptionSubmittedEmail,
  sendSubscriptionApprovedEmail,
  sendSubscriptionRejectedEmail,
  sendCustomerWelcomeEmail,
  sendOtpEmail,
};
