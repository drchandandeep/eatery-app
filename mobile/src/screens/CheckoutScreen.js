// screens/CheckoutScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { colors, spacing, type, radius } from '../theme';
import Button from '../components/Button';
import { useCart } from '../context/CartContext';
import { api } from '../api/client';
import { showAlert } from '../utils/alert';
import { buildUpiUri, openUpiApp } from '../utils/upi';

// Client-side estimate only, shown before the order is placed -- the real,
// authoritative total is always recomputed server-side (see
// backend/routes/orders.js) from the actual cart, so these just need to
// match that for the estimate to be accurate, not to be trusted for billing.
const TAX_RATE = 0.05; // India GST for restaurants (non-AC/composition scheme)
const DELIVERY_FEE = 100; // flat delivery fee in rupees -- must match backend/utils/config.js

// Neither payment method here is verified by a gateway -- "Pay online"
// jumps straight into the customer's own UPI app (GPay/PhonePe/etc, via a
// upi://pay deep link) with the store's UPI ID and the exact amount
// pre-filled, so they just confirm and pay -- no manual QR scanning needed
// on the same phone. The store's QR image is still shown as a fallback for
// when no UPI ID is set or no UPI app can be opened. Cash on Delivery is
// settled in person. Either way, the store owner is the one who actually
// knows when money has landed, and confirms that by advancing the order's
// status (see AdminOrdersScreen) -- there's no payment gateway in this app.
export default function CheckoutScreen({ navigation }) {
  const { lines, subtotal, clearCart } = useCart();
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState('cash');
  const [placing, setPlacing] = useState(false);
  const [storeQr, setStoreQr] = useState(null); // { image_base64, upi_id } | null
  const [storeName, setStoreName] = useState('');
  const [upiAttempted, setUpiAttempted] = useState(false);

  useEffect(() => {
    api
      .getMenu()
      .then((data) => {
        setStoreQr(data.store_order_qr || null);
        setStoreName(data.store_name || 'Kahumbo');
      })
      .catch(() => {});
  }, []);

  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + DELIVERY_FEE;

  const paymentMethods = [
    { key: 'cash', label: 'Cash on Delivery (Cash / UPI)' },
    {
      key: 'qr',
      label: storeQr ? 'Pay online' : 'Pay online (not set up by this store yet)',
      disabled: !storeQr,
    },
  ];

  function currentCartItems() {
    return lines.map((l) => ({
      menu_item_id: l.menu_item_id,
      quantity: l.quantity,
      selected_options: l.selected_options,
    }));
  }

  async function handleOpenUpiApp() {
    const uri = buildUpiUri({ upiId: storeQr?.upi_id, payeeName: storeName, amount: total, note: `Order at ${storeName}` });
    const opened = await openUpiApp(uri);
    setUpiAttempted(true);
    if (!opened) {
      showAlert(
        'Could not open a UPI app',
        'No UPI app was detected, or it could not be opened automatically. Please scan the QR code below instead.'
      );
    }
  }

  async function handlePlaceOrder() {
    if (!address.trim()) {
      showAlert('Delivery address needed', 'Please add where we should deliver your order.');
      return;
    }
    if (payment === 'qr' && !storeQr) {
      showAlert('QR not available', "This store hasn't set up a payment QR code yet. Please choose Cash on Delivery.");
      return;
    }

    setPlacing(true);
    try {
      const { order } = await api.placeOrder({
        items: currentCartItems(),
        address_line: address.trim(),
        payment_method: payment,
      });
      clearCart();
      navigation.replace('OrderTracking', { orderId: order.id });
    } catch (err) {
      showAlert('Could not place order', err.message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.display, { marginBottom: spacing(5) }]}>Checkout</Text>

        <Text style={styles.label}>Delivery address</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Street, city, zip"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Text style={[styles.label, { marginTop: spacing(5) }]}>Payment method</Text>
        <View style={{ gap: spacing(2) }}>
          {paymentMethods.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => !m.disabled && setPayment(m.key)}
              disabled={m.disabled}
              style={[
                styles.paymentRow,
                payment === m.key && styles.paymentRowActive,
                m.disabled && styles.paymentRowDisabled,
              ]}
            >
              <View style={[styles.radio, payment === m.key && styles.radioActive]} />
              <Text style={[type.body, payment === m.key && { color: colors.text, fontWeight: '600' }, m.disabled && { color: colors.textMuted }]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {payment === 'qr' && storeQr && (
          <View style={styles.qrCard}>
            <Image source={{ uri: storeQr.image_base64 }} style={styles.qrImage} resizeMode="contain" />
            {storeQr.upi_id && <Text style={[type.bodyMuted, { marginTop: spacing(2) }]}>UPI ID: {storeQr.upi_id}</Text>}
            {storeQr.upi_id ? (
              <>
                <Button
                  title={`Pay \u20b9${Math.round(total)} Now \u2014 Open UPI App`}
                  onPress={handleOpenUpiApp}
                  style={{ width: '100%', marginTop: spacing(3) }}
                />
                <Text style={[type.caption, { marginTop: spacing(2), textAlign: 'center' }]}>
                  {`This opens your UPI app (GPay, PhonePe, etc.) with the store's UPI ID and the \u20b9${Math.round(total)} amount already filled in \u2014 just confirm and pay. Prefer to scan instead? Use the QR code above.`}
                </Text>
              </>
            ) : null}
            <Text style={[type.caption, { marginTop: spacing(2), textAlign: 'center' }]}>
              {upiAttempted
                ? 'Once you\u2019ve completed the payment, tap "Place order" below.'
                : `Or scan the QR above in your UPI app, pay \u20b9${Math.round(total)}, then tap "Place order" below once you've paid.`}
            </Text>
          </View>
        )}

        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={subtotal} />
          <SummaryRow label="Delivery fee" value={DELIVERY_FEE} />
          <SummaryRow label="Tax (GST)" value={tax} />
          <View style={styles.divider} />
          <SummaryRow label="Total" value={total} bold />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={payment === 'qr' ? `I've paid \u2014 Place order \u00b7 \u20b9${Math.round(total)}` : `Place order \u00b7 \u20b9${Math.round(total)}`}
          onPress={handlePlaceOrder}
          loading={placing}
        />
      </View>
    </View>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={bold ? type.h2 : type.bodyMuted}>{label}</Text>
      <Text style={bold ? type.h2 : type.body}>₹{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(5), paddingTop: spacing(14), paddingBottom: spacing(10) },
  label: { ...type.caption, marginBottom: spacing(1.5) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  paymentRowActive: { borderColor: colors.accent },
  paymentRowDisabled: { opacity: 0.5 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  qrCard: {
    marginTop: spacing(3),
    padding: spacing(4),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  qrImage: { width: 200, height: 200, borderRadius: radius.sm },
  summary: { marginTop: spacing(8), backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(4), borderWidth: 1, borderColor: colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1.5) },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing(2) },
  footer: { padding: spacing(5), borderTopWidth: 1, borderTopColor: colors.border },
});
