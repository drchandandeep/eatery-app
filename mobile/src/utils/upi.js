// utils/upi.js
// Builds a standard UPI deep link (the same "upi://pay?..." scheme every
// UPI app on Android -- GPay, PhonePe, Paytm, etc. -- registers itself to
// handle) so tapping "Pay now" jumps straight into the customer's own UPI
// app with the payee, amount, and a note pre-filled, instead of making
// them manually scan a QR code image on the same phone they're already
// using. The QR image is still shown alongside this as a fallback (e.g. if
// no UPI app is installed, or the customer wants to pay from a different
// device).
import { Linking } from 'react-native';

export function buildUpiUri({ upiId, payeeName, amount, note }) {
  if (!upiId) return null;
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName || 'Kahumbo',
    am: Number(amount).toFixed(2),
    cu: 'INR',
  });
  if (note) params.set('tn', note.slice(0, 50)); // UPI apps commonly truncate/reject long notes
  return `upi://pay?${params.toString()}`;
}

// Returns true if it managed to open a UPI app, false otherwise (caller
// should fall back to "scan the QR below" messaging in that case).
export async function openUpiApp(uri) {
  if (!uri) return false;
  try {
    const supported = await Linking.canOpenURL(uri);
    if (!supported) return false;
    await Linking.openURL(uri);
    return true;
  } catch (err) {
    return false;
  }
}
